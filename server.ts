import express from 'express';
import cors from 'cors';
import axios from 'axios';
import FormData from 'form-data';
import crypto from 'crypto';
import multer from 'multer';

const app = express();

// Allow all origins (This fixes the CORS error!)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

// Get keys from Render environment variables
const config = {
  acrHost: process.env.ACRCLOUD_HOST || '',
  acrAccessKey: process.env.ACRCLOUD_ACCESS_KEY || '',
  acrAccessSecret: process.env.ACRCLOUD_ACCESS_SECRET || '',
};

function buildStringToSign(method: string, uri: string, accessKey: string, dataType: string, signatureVersion: string, timestamp: number) {
  return [method, uri, accessKey, dataType, signatureVersion, timestamp].join('\n');
}

function sign(signString: string, accessSecret: string) {
  return crypto.createHmac('sha1', accessSecret)
    .update(Buffer.from(signString, 'utf-8'))
    .digest().toString('base64');
}

async function getITunesData(title: string, artist: string) {
  try {
    const query = encodeURIComponent(`${title} ${artist}`);
    const res = await axios.get(`https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=1`);
    if (res.data.results && res.data.results.length > 0) {
      const track = res.data.results[0];
      return {
        coverArt: track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '512x512bb') : null,
      };
    }
  } catch (e: any) {
    console.error('iTunes API error:', e.message);
  }
  return null;
}

app.post('/api/identify', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No audio file provided' });
  if (!config.acrHost) return res.status(400).json({ success: false, message: 'ACRCloud not configured' });

  try {
    const currentData = new Date();
    const timestamp = Math.floor(currentData.getTime() / 1000);
    const stringToSign = buildStringToSign('POST', '/v1/identify', config.acrAccessKey, 'audio', '1', timestamp);
    const signature = sign(stringToSign, config.acrAccessSecret);

    const form = new FormData();
    form.append('sample', req.file.buffer, { filename: 'sample.webm', contentType: 'audio/webm' });
    form.append('access_key', config.acrAccessKey);
    form.append('data_type', 'audio');
    form.append('signature_version', '1');
    form.append('signature', signature);
    form.append('sample_bytes', req.file.buffer.length);
    form.append('timestamp', timestamp);

    const response = await axios.post(`https://${config.acrHost}/v1/identify`, form, {
      headers: form.getHeaders()
    });

    const result = response.data;
    if (result && result.status && result.status.code === 0) {
      const music = result.metadata?.music?.[0];
      if (music) {
        const title = music.title;
        const artist = music.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist';
        const itunesData = await getITunesData(title, artist);
        
        return res.json({ 
          success: true, 
          song: { title, artist, itunesData } 
        });
      }
    }
    res.json({ success: false, message: 'No match found' });
  } catch (error: any) {
    console.error('Identify error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
