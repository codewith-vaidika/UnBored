# ✨ UnBored

**Stop Scrolling. Start Living.**

UnBored is an AI-powered personalized activity recommendation platform. Feeling bored? Tell us your mood, your budget, how much time you have, and your location. UnBored's Gemini AI engine will instantly craft the perfect, personalized activity so you can get off the couch and do something amazing.

---

## 🚀 Features

- **AI Recommendations**: Powered by Google's cutting-edge Gemini 2.5 AI to generate highly contextual, creative activity ideas.
- **Vibe Checks**: Quick filter pills (Trending, Chill, Active, Creative) to instantly fetch ideas based on your current energy.
- **Personalized Dashboard**: A central hub featuring a time-based greeting, lifetime search/save stats, and your recent search history.
- **Saved Canvas**: A beautiful, masonry-style grid to save and organize your favorite AI recommendations.
- **Premium UI/UX**: Designed with a clean, high-end aesthetic inspired by Notion and Airbnb. Features Plus Jakarta Sans typography, Lucide SVG icons, soft shadows, and a fully responsive layout.
- **Authentication**: Secure user signup and login handled via Passport.js.
- **Avatar Uploads**: Users can upload custom profile pictures securely stored via Cloudinary.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB & Mongoose
- **AI Integration**: Google Generative AI SDK (`gemini-2.5-flash`)
- **Frontend**: EJS (Embedded JavaScript), Tailwind CSS, Vanilla JS
- **Authentication**: Passport.js (Local Strategy), express-session
- **Image Storage**: Cloudinary (via Multer)

---

## ⚙️ Local Setup & Installation

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/unbored.git
cd unbored
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory and add your credentials. **Note:** `.env` is included in `.gitignore` and should never be committed to version control.

```env
# Server Port
PORT=3000

# MongoDB URI (Local or Atlas)
MONGO_URI=mongodb://127.0.0.1:27017/unbored

# Express Session Secret
SESSION_SECRET=your_super_secret_session_key

# Google Gemini API Key (Get from Google AI Studio)
GEMINI_API_KEY=your_gemini_api_key_here

# Cloudinary Credentials (For image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 4. Start the application
For development (with auto-reload):
```bash
npm run dev
```
For production:
```bash
npm start
```

Visit `http://localhost:3000` in your browser.

---

## 📸 Screenshots

*(Add screenshots of your stunning homepage, dashboard, and AI recommendation results here!)*

---

## 📝 License

This project is licensed under the MIT License.
