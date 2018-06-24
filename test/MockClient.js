const WebSocket = require('ws');

class MockClient {
    async connect(port) {
        this.ws = new WebSocket(`ws://127.0.0.1:${port}/`);
        return new Promise(resolve => {
            this.ws.addEventListener('open', () => resolve());
        });
    }

    async disconnect() {
        this.ws.close();
    }

    
}

module.exports = MockClient;