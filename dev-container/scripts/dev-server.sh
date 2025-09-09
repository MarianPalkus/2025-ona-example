#!/bin/bash

# Development server startup script
# Usage: ./dev-server.sh <project-type> <port> [additional-args]

PROJECT_TYPE=$1
PORT=${2:-3000}
PROJECT_DIR=${3:-$(pwd)}

if [ -z "$PROJECT_TYPE" ]; then
    echo "Usage: $0 <project-type> [port] [project-dir]"
    echo "Project types: node, react, vue, angular, python, go, rust, java"
    exit 1
fi

cd "$PROJECT_DIR" || exit 1

case $PROJECT_TYPE in
    "node")
        if [ -f "package.json" ]; then
            if grep -q "\"dev\"" package.json; then
                npm run dev
            elif grep -q "\"start\"" package.json; then
                npm start
            else
                node index.js || node server.js || node app.js
            fi
        else
            echo "No package.json found"
            exit 1
        fi
        ;;
    
    "react")
        if [ -f "package.json" ]; then
            npm start
        else
            echo "No React project found"
            exit 1
        fi
        ;;
    
    "vue")
        if [ -f "package.json" ]; then
            npm run serve || npm run dev
        else
            echo "No Vue project found"
            exit 1
        fi
        ;;
    
    "angular")
        if [ -f "angular.json" ]; then
            ng serve --host 0.0.0.0 --port $PORT
        else
            echo "No Angular project found"
            exit 1
        fi
        ;;
    
    "python")
        if [ -f "requirements.txt" ]; then
            pip install -r requirements.txt
        fi
        
        if [ -f "main.py" ]; then
            python3 main.py
        elif [ -f "app.py" ]; then
            python3 app.py
        elif [ -f "manage.py" ]; then
            python3 manage.py runserver 0.0.0.0:$PORT
        else
            echo "No Python entry point found"
            exit 1
        fi
        ;;
    
    "go")
        if [ -f "go.mod" ]; then
            go run .
        elif [ -f "main.go" ]; then
            go run main.go
        else
            echo "No Go project found"
            exit 1
        fi
        ;;
    
    "rust")
        if [ -f "Cargo.toml" ]; then
            cargo run
        else
            echo "No Rust project found"
            exit 1
        fi
        ;;
    
    "java")
        if [ -f "pom.xml" ]; then
            mvn spring-boot:run
        elif [ -f "build.gradle" ]; then
            ./gradlew bootRun
        else
            echo "No Java project found"
            exit 1
        fi
        ;;
    
    *)
        echo "Unknown project type: $PROJECT_TYPE"
        echo "Supported types: node, react, vue, angular, python, go, rust, java"
        exit 1
        ;;
esac