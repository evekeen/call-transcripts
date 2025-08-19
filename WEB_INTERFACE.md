# Multi-Platform Call Intelligence Web Interface

A simple, beautiful web interface to view and browse call recordings and transcripts across multiple platforms (Gong, Clari, Fireflies, Fathom, Otter).

## Features

- 🔍 **Browse Multi-Platform Calls**: View calls from any supported platform (Gong, Clari, Fireflies, Fathom, Otter)
- 🔄 **Platform Selector**: Switch between platforms seamlessly
- 📝 **View Transcripts**: Click on any call to see the full transcript with speaker segments  
- 🗃️ **Stored Transcripts**: View transcripts that have been processed and stored in Supabase
- 📅 **Date Filtering**: Filter calls by date range across all platforms
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile
- ⚡ **Real-time Loading**: Fast API integration with loading states

## How to Run

### Prerequisites

You can configure credentials in two ways:

**Option 1: Environment Variables (Easier for Development)**
1. Copy `.env.example` to `.env`
2. Set `PLATFORM_ENABLED=true` for platforms you want to use
3. Add your API credentials for enabled platforms
4. Configure Supabase credentials (optional, for stored transcripts)

**Option 2: AWS Secrets Manager (Production)**
1. Store credentials in AWS Secrets Manager:
   - `gong-api-credentials` (for Gong)
   - `clari-api-credentials` (for Clari)  
   - `fireflies-api-credentials` (for Fireflies)
   - `fathom-api-credentials` (for Fathom)
   - `otter-api-credentials` (for Otter)
2. Configure AWS credentials
3. Set platform enablement in environment variables

### Quick Start

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Configure credentials** (choose one option):
   ```bash
   # Option 1: Copy and edit .env file
   cp .env.example .env
   # Edit .env with your credentials
   
   # Option 2: Set environment variables directly
   export GONG_ENABLED=true
   
   # Choose one authentication method:
   # Method A: OAuth (for OAuth apps)
   export GONG_CLIENT_ID=your_gong_client_id
   export GONG_CLIENT_SECRET=your_gong_client_secret
   
   # Method B: Basic Auth (recommended, easier setup)
   export GONG_API_KEY=your_gong_api_key
   export GONG_API_SECRET=your_gong_api_secret
   ```

3. **Start the web server**:
   ```bash
   npm run web
   ```

4. **Open your browser** and navigate to:
   ```
   http://localhost:3000
   ```

### Production Mode

For production, compile TypeScript first:
```bash
npm run web:build
```

## API Endpoints

The web interface uses these API endpoints:

- `GET /api/gong/calls` - Fetch calls from Gong
- `GET /api/gong/transcripts/:callId` - Get transcript for a specific call
- `GET /api/transcripts` - Search stored transcripts
- `GET /api/transcripts/:id` - Get a specific stored transcript

### Query Parameters for `/api/gong/calls`:
- `startDate` - Start date filter (YYYY-MM-DD)
- `endDate` - End date filter (YYYY-MM-DD)  
- `limit` - Maximum number of calls (default: 50)

## Using the Interface

### Main Dashboard
- The interface loads with the last 30 days of calls by default
- Use the date inputs to filter calls by date range
- Adjust the limit to load more or fewer calls
- Click "Load Calls" to fetch fresh data from Gong
- Click "View Stored Transcripts" to see processed transcripts

### Call Cards
Each call is displayed as a card showing:
- Call title
- Date and time
- Duration
- Platform (Gong)
- List of attendees (with host/participant roles)

### Viewing Transcripts
- Click any call card to open the transcript modal
- Transcripts show speaker segments with timestamps
- Use the × button or click outside to close
- Press Escape key to close

## Troubleshooting

### Common Issues

**"Failed to load calls" error:**
- Check your Gong API credentials in AWS Secrets Manager or environment variables
- For AWS: Ensure the secret name is exactly `gong-api-credentials`
- For Basic Auth: Get API Key/Secret from Gong Admin > Company Settings > Ecosystem > API
- For OAuth: Verify your OAuth app is properly configured and approved by Gong

**Empty call list:**
- Try adjusting your date range
- Check if you have calls in the selected time period
- Verify Gong authentication is working

**Transcript loading errors:**
- Some calls may not have transcripts available yet
- Check if the call was recently recorded (processing time)
- Verify transcript permissions in Gong

### Server Configuration

Default configuration:
- Port: 3000 (set `PORT` environment variable to change)
- Static files served from: `/public`
- API base path: `/api`

### Development

To run in development mode with auto-reload:
```bash
npm run web
```

This uses `tsx` to run TypeScript directly without compilation.

## Security Notes

- The interface connects to your local API server
- Gong credentials are securely stored in AWS Secrets Manager
- No sensitive data is cached in the browser
- CORS is enabled for development (configure for production)

## Browser Support

- Chrome/Edge 88+
- Firefox 85+
- Safari 14+
- Mobile browsers supported