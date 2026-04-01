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

app.post('/api/identify', upload.single('audio'), async (req, res) => {
  console.log("Received audio for AudD identification!");
  
  if (!req.file) return res.status(400).json({ success: false, message: 'No audio file provided' });
  if (!AUDD_API_TOKEN) return res.status(400).json({ success: false, message: 'AudD API Token not configured' });

  try {
    const form = new FormData();
    form.append('api_token', AUDD_API_TOKEN);
    form.append('audio', req.file.buffer, { filename: 'sample.webm', contentType: 'audio/webm' });
    form.append('return', 'apple_music'); 

    const response = await axios.post('https://api.audd.io/', form, {
      headers: form.getHeaders()
    });

    const result = response.data;
    
    // Print EXACTLY what AudD says to the Render logs
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
