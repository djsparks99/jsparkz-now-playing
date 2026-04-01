import express from 'express';
import cors from 'cors';
import axios from 'axios';
import FormData from 'form-data';
import multer from 'multer';

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['*'],
  credentials: false
}));
app.options('*', cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 10000;
const AUDD_API_TOKEN = process.env.AUDD_API_TOKEN || '';

// ==========================================
// 1. LAZY CHAT BOT LOGIC (1 Token)
// ==========================================
const OWNCAST_URL = process.env.OWNCAST_URL || ''; 
const OWNCAST_TOKEN = process.env.OWNCAST_TOKEN || ''; 

const fakeMessages = [
    "Sick drop! 🔥", 
    "Yoooo this is heavy", 
    "Rewind!! ⏪", 
    "Big up the DJ", 
    "Tune!", 
    "Vibes 🔊", 
    "Nasty bassline", 
    "Let's gooo",
    "Absolute belter",
    "🔥🔥🔥"
];

function sendFakeChat() {
    if (!OWNCAST_URL || !OWNCAST_TOKEN) return;
    
    const msg = fakeMessages[Math.floor(Math.random() * fakeMessages.length)];
    const baseUrl = OWNCAST_URL.replace(/\/$/, '');

    axios.post(`${baseUrl}/api/integrations/chat/send`, {
        body: msg
    }, {
        headers: { 
            'Authorization': `Bearer ${OWNCAST_TOKEN}`,
            'Content-Type': 'application/json'
        }
    }).then(() => {
        console.log(`Fake chat sent: ${msg}`);
    }).catch(err => {
        console.log("Chat bot error:", err.message);
    });
}

function scheduleNextMessage() {
    if (!OWNCAST_URL || !OWNCAST_TOKEN) return;
    
    // Picks a random time between 3 minutes and 8 minutes
    const nextTime = Math.floor(Math.random() * (480000 - 180000)) + 180000;
    
    setTimeout(() => {
        sendFakeChat();
        scheduleNextMessage(); 
    }, nextTime);
}

// Start the bot
scheduleNextMessage();


// ==========================================
// 2. AUDD NOW PLAYING LOGIC
// ==========================================
app.post('/api/identify', upload.single('audio'), async (req, res) => {
  console.log("Received audio for AudD identification!");
  
  if (!req.file) return res.status(400).json({ success: false, message: 'No audio file provided' });
  if (!AUDD_API_TOKEN) return res.status(400).json({ success: false, message: 'AudD API Token not configured' });

  try {
    const form = new FormData();
    form.append('api_token', AUDD_API_TOKEN);
    form.append('file', req.file.buffer, { filename: 'sample.webm', contentType: 'audio/webm' });
    form.append('return', 'apple_music'); 

    // FIX: Send the exact headers AudD needs without corrupting the file boundary!
    const response = await axios.post('https://api.audd.io/', form, {
      headers: form.getHeaders()
    });

    const result = response.data;
    console.log("AudD Response:", JSON.stringify(result));
    
    if (result && result.status === 'success' && result.result) {
      const title = result.result.title;
      const artist = result.result.artist;
      let coverArt = null;
      if (result.result.apple_music && result.result.apple_music.artwork) {
          coverArt = result.result.apple_music.artwork.url.replace('{w}', '512').replace('{h}', '512');
      }
      console.log(`Identified: ${title} by ${artist}`);
      return res.json({ success: true, song: { title, artist, itunesData: { coverArt } } });
    }
    
    res.json({ success: false, message: 'No match found' });
  } catch (error: any) {
    console.error('Identify error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
});
