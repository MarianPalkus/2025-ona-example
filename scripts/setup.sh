#!/bin/bash

# AI Agent Development Environment Setup Script

set -e

echo "🚀 Setting up AI Agent Development Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! command -v docker compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi

    print_success "Prerequisites check passed"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."

    mkdir -p repositories
    mkdir -p logs
    mkdir -p data/gitea
    mkdir -p data/dev-container-home
    mkdir -p mcp-server/config
    mkdir -p agent-orchestrator/config
    mkdir -p web-ui/config

    print_success "Directories created"
}

# Setup environment file
setup_environment() {
    print_status "Setting up environment configuration..."

    if [ ! -f .env ]; then
        cp .env.example .env
        print_warning "Created .env file from template. Please edit it with your API keys and configuration."
        print_warning "Required: ANTHROPIC_API_KEY and/or OPENAI_API_KEY"
    else
        print_success "Environment file already exists"
    fi
}

# Generate secrets
generate_secrets() {
    print_status "Generating secrets..."

    if [ ! -f .env ]; then
        print_error ".env file not found. Run setup_environment first."
        return 1
    fi

    # Generate JWT secret if not set
    if ! grep -q "JWT_SECRET=your_jwt_secret_here" .env; then
        JWT_SECRET=$(openssl rand -hex 32)
        sed -i "s/JWT_SECRET=your_jwt_secret_here/JWT_SECRET=$JWT_SECRET/" .env
        print_success "Generated JWT secret"
    fi

    # Generate webhook secret if not set
    if ! grep -q "WEBHOOK_SECRET=your_webhook_secret_here" .env; then
        WEBHOOK_SECRET=$(openssl rand -hex 16)
        sed -i "s/WEBHOOK_SECRET=your_webhook_secret_here/WEBHOOK_SECRET=$WEBHOOK_SECRET/" .env
        sed -i "s/GITEA_WEBHOOK_SECRET=your_webhook_secret_here/GITEA_WEBHOOK_SECRET=$WEBHOOK_SECRET/" .env
        print_success "Generated webhook secret"
    fi

    # Generate session secret if not set
    if ! grep -q "SESSION_SECRET=your_session_secret_here" .env; then
        SESSION_SECRET=$(openssl rand -hex 32)
        sed -i "s/SESSION_SECRET=your_session_secret_here/SESSION_SECRET=$SESSION_SECRET/" .env
        print_success "Generated session secret"
    fi
}

# Build Docker images
build_images() {
    print_status "Building Docker images..."

    docker compose build --no-cache

    print_success "Docker images built successfully"
}

# Initialize Gitea
initialize_gitea() {
    print_status "Initializing Gitea..."

    # Start only Gitea first
    docker compose up -d gitea

    # Wait for Gitea to be ready
    print_status "Waiting for Gitea to be ready..."
    sleep 30

    # Check if Gitea is accessible
    max_attempts=30
    attempt=1
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:3001 > /dev/null; then
            print_success "Gitea is ready"
            break
        fi
        print_status "Waiting for Gitea... (attempt $attempt/$max_attempts)"
        sleep 10
        ((attempt++))
    done

    if [ $attempt -gt $max_attempts ]; then
        print_error "Gitea failed to start within expected time"
        return 1
    fi
}

# Create Gitea admin user and token
setup_gitea_admin() {
    print_status "Setting up Gitea admin user..."

    # Create admin user
    docker compose exec --user git gitea gitea admin user create \
        --username gitea-admin \
        --password admin123 \
        --email admin@example.com \
        --admin \
        --must-change-password=false || true

    # Generate or reuse Gitea access token
    print_status "Ensuring Gitea access token is available..."

    # If .env already has a non-placeholder token, skip generation
    CURRENT_TOKEN=$(grep -E '^GITEA_TOKEN=' .env | cut -d'=' -f2-)
    if [ -n "$CURRENT_TOKEN" ] && [ "$CURRENT_TOKEN" != "your_gitea_access_token" ]; then
        print_success "Existing Gitea token found in .env; skipping token generation."
    else
        BASE_TOKEN_NAME="ai-agent-token"

        # Try to create with the base name first
        OUTPUT=$(docker compose exec --user git gitea gitea admin user generate-access-token \
            --username gitea-admin \
            --token-name "$BASE_TOKEN_NAME" \
            --scopes "write:repository,write:issue,write:user" 2>&1 || true)

        TOKEN=$(echo "$OUTPUT" | grep -o 'gto_[A-Za-z0-9]\+')

        # If name is already used, create a unique token name
        if [ -z "$TOKEN" ] && echo "$OUTPUT" | grep -qi "has been used"; then
            UNIQUE_NAME="${BASE_TOKEN_NAME}-$(date +%Y%m%d%H%M%S)"
            print_warning "Token name '${BASE_TOKEN_NAME}' already exists. Creating '${UNIQUE_NAME}' instead."

            OUTPUT=$(docker compose exec --user git gitea gitea admin user generate-access-token \
                --username gitea-admin \
                --token-name "$UNIQUE_NAME" \
                --scopes "write:repository,write:issue,write:user" 2>&1 || true)

            TOKEN=$(echo "$OUTPUT" | grep -o 'gto_[A-Za-z0-9]\+')
        fi

        if [ -n "$TOKEN" ]; then
            # Portable sed for macOS (BSD) and Linux (GNU)
            if sed --version >/dev/null 2>&1; then
                sed -i "s|GITEA_TOKEN=your_gitea_access_token|GITEA_TOKEN=$TOKEN|" .env
            else
                sed -i '' "s|GITEA_TOKEN=your_gitea_access_token|GITEA_TOKEN=$TOKEN|" .env
            fi
            print_success "Gitea access token generated and saved to .env"
        else
            print_warning "Failed to generate Gitea token automatically. Please create one manually in Gitea and set GITEA_TOKEN in .env."
            # Optional: uncomment next line to help diagnose non-sensitive errors
            # print_warning "Token generation output: $OUTPUT"
        fi
    fi
}

# Start all services
start_services() {
    print_status "Starting all services..."

    docker compose up -d

    print_success "All services started"
}

# Verify installation
verify_installation() {
    print_status "Verifying installation..."

    # Check service health
    services=("gitea:3001" "mcp-git-server:8080" "agent-orchestrator:9000" "web-ui:4000")

    for service in "${services[@]}"; do
        name=$(echo $service | cut -d: -f1)
        port=$(echo $service | cut -d: -f2)

        if curl -s http://localhost:$port/health > /dev/null 2>&1 || curl -s http://localhost:$port > /dev/null 2>&1; then
            print_success "$name is running on port $port"
        else
            print_warning "$name may not be ready yet on port $port"
        fi
    done
}

# Print access information
print_access_info() {
    echo ""
    echo "🎉 Setup completed! Access your services:"
    echo ""
    echo "📊 Web UI:           http://localhost:4000"
    echo "🔧 Gitea:            http://localhost:3001"
    echo "🤖 Agent API:        http://localhost:9000"
    echo "🔌 MCP Server:       http://localhost:8080"
    echo "💻 Dev Container:    ssh developer@localhost -p 2223 (password: developer)"
    echo ""
    echo "📝 Default Gitea credentials:"
    echo "   Username: admin"
    echo "   Password: admin123"
    echo ""
    echo "⚠️  Important: Edit .env file with your API keys before using agents!"
    echo ""
    echo "📚 Documentation: See README.md for usage instructions"
    echo ""
}

# Main setup function
main() {
    echo "AI Agent Development Environment Setup"
    echo "======================================"
    echo ""

    check_prerequisites
    create_directories
    setup_environment
    generate_secrets
    build_images
    initialize_gitea
    setup_gitea_admin

    # Wait a bit for services to fully start
    sleep 10

    verify_installation
    print_access_info
}

# Handle script arguments
case "${1:-}" in
    "clean")
        print_status "Cleaning up environment..."
        docker compose down -v
        docker system prune -f
        rm -rf data/ logs/ repositories/
        print_success "Environment cleaned"
        ;;
    "restart")
        print_status "Restarting services..."
        docker compose restart
        print_success "Services restarted"
        ;;
    "logs")
        docker compose logs -f
        ;;
    "status")
        docker compose ps
        ;;
    *)
        main
        ;;
esac
