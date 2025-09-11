const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

// Environment variables
const AGENT_ORCHESTRATOR_URL = process.env.AGENT_ORCHESTRATOR_URL || 'http://localhost:9000';
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8089';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      agent_orchestrator: AGENT_ORCHESTRATOR_URL,
      mcp_server: MCP_SERVER_URL
    }
  });
});

// Main dashboard endpoint
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>AI Agent Development Environment</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #333; border-bottom: 3px solid #007acc; padding-bottom: 10px; }
            .services { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 30px 0; }
            .service-card { background: #f8f9fa; padding: 20px; border-radius: 6px; border-left: 4px solid #007acc; }
            .service-card h3 { margin-top: 0; color: #333; }
            .service-link { color: #007acc; text-decoration: none; font-weight: bold; }
            .service-link:hover { text-decoration: underline; }
            .status { margin-top: 10px; }
            .status-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }
            .status-healthy { background-color: #28a745; }
            .footer { margin-top: 40px; text-align: center; color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 AI Agent Development Environment</h1>
            <p>Welcome to your AI agent development environment dashboard. All services are running and ready for development.</p>
            
            <div class="services">
                <div class="service-card">
                    <h3>🔧 Gitea Git Server</h3>
                    <p>Version control system with issue tracking</p>
                    <a href="http://localhost:3030" class="service-link" target="_blank">Open Gitea →</a>
                    <div class="status">
                        <span class="status-indicator status-healthy"></span>
                        <span>Running on port 3030</span>
                    </div>
                </div>
                
                <div class="service-card">
                    <h3>🔌 MCP Server</h3>
                    <p>Git repository access with Gitea integration</p>
                    <a href="${MCP_SERVER_URL}" class="service-link" target="_blank">Open MCP Server →</a>
                    <div class="status">
                        <span class="status-indicator status-healthy"></span>
                        <span>Running on port 8089</span>
                    </div>
                </div>
                
                <div class="service-card">
                    <h3>🤖 Agent Orchestrator</h3>
                    <p>Handles Claude/OpenAI interactions</p>
                    <a href="${AGENT_ORCHESTRATOR_URL}" class="service-link" target="_blank">Open Agent API →</a>
                    <div class="status">
                        <span class="status-indicator status-healthy"></span>
                        <span>Running on port 9000</span>
                    </div>
                </div>
                
                <div class="service-card">
                    <h3>💻 Dev Container</h3>
                    <p>Development environment for coding</p>
                    <code>ssh developer@localhost -p 2223</code>
                    <div class="status">
                        <span class="status-indicator status-healthy"></span>
                        <span>SSH access available</span>
                    </div>
                </div>
            </div>
            
            <div class="footer">
                <p>📝 <strong>Default Gitea credentials:</strong> admin / admin123</p>
                <p>⚠️ <strong>Important:</strong> Edit .env file with your API keys before using agents!</p>
                <p>📚 See README.md for usage instructions</p>
            </div>
        </div>
    </body>
    </html>
  `);
});

// API endpoint for service status
app.get('/api/status', (req, res) => {
  res.json({
    services: [
      { name: 'gitea', url: 'http://localhost:3030', status: 'running' },
      { name: 'mcp-server', url: MCP_SERVER_URL, status: 'running' },
      { name: 'agent-orchestrator', url: AGENT_ORCHESTRATOR_URL, status: 'running' },
      { name: 'dev-container', url: 'ssh://localhost:2223', status: 'running' }
    ],
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web UI server running on http://0.0.0.0:${PORT}`);
  console.log(`🔗 Agent Orchestrator: ${AGENT_ORCHESTRATOR_URL}`);
  console.log(`🔗 MCP Server: ${MCP_SERVER_URL}`);
});
