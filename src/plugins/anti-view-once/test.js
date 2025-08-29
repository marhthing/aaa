// Test script to add some sample view-once data for testing
const AntiViewOncePlugin = require('./index.js');

async function testPlugin() {
    const plugin = new AntiViewOncePlugin();
    
    // Add some test view-once data
    const testViewOnceData = {
        messageId: 'TEST123456789',
        senderJid: '2347018091555@s.whatsapp.net',
        timestamp: new Date(),
        mediaPath: null,
        mediaMetadata: null,
        caption: 'Test view-once message',
        type: 'text'
    };
    
    plugin.viewOnceStorage.set('TEST123456789', testViewOnceData);
    
    console.log('Test data added to view-once storage');
    console.log('Storage size:', plugin.viewOnceStorage.size);
    console.log('Test data:', testViewOnceData);
}

testPlugin();