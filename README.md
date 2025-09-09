# 🚀 AI Child Safety Pipeline - Netlify Functions

A comprehensive safety pipeline for AI-generated baby images, deployed as Netlify Functions.

## ✨ **Features**

- 🛡️ **NSFW Detection** - Automatic content moderation
- 👕 **Clothing Inpainting** - Adds appropriate clothing if needed
- 🧔 **Facial Hair Removal** - Optional dad preprocessing
- 🔄 **Multi-step Safety** - 3 levels of validation
- 📱 **iOS App Ready** - CORS configured for mobile apps

## 🏗️ **Architecture**

```
iOS App → Netlify Function → Replicate AI → Safe Baby Image
    ↓
Existing Image Hosting (https://aichild.webhop.me/)
```

## 🚀 **Quick Deploy**

1. **Create GitHub repo** with these files
2. **Connect to Netlify** from GitHub
3. **Set environment variable**: `REPLICATE_API_TOKEN`
4. **Deploy!**

## 📁 **Files**

- `netlify/functions/generate-baby.js` - Main safety pipeline
- `netlify.toml` - Netlify configuration
- `package.json` - Dependencies

## 🧪 **Test**

```bash
curl -X POST https://YOUR-SITE.netlify.app/.netlify/functions/generate-baby \
  -H "Content-Type: application/json" \
  -d '{"momUrl": "https://aichild.webhop.me/files/SwR4n5k0DdZjeCzTOcOizshOXv82/xNCQzC0T3ghMgGBp8YSV/mother.png", "dadUrl": "https://aichild.webhop.me/files/SwR4n5k0DdZjeCzTOcOizshOXv82/xNCQzC0T3ghMgGBp8YSV/father.png"}'
```

## 📱 **iOS Integration**

Your app will use:
- **Image Upload**: `https://aichild.webhop.me/uploadImage` (unchanged)
- **Baby Generation**: `https://YOUR-SITE.netlify.app/.netlify/functions/generate-baby` (new)

## 🔧 **Environment Variables**

- `REPLICATE_API_TOKEN` - Your Replicate API token

## 📊 **Safety Pipeline Steps**

1. **Dad Preprocessing** (optional) - Remove facial hair
2. **Baby Generation** - Create baby image
3. **NSFW Check #1** - Initial safety check
4. **Clothing Inpainting** (if flagged) - Add appropriate clothing
5. **NSFW Check #2** - Verify clothed version
6. **Retry Inpainting** (if still flagged) - Alternative approach
7. **NSFW Check #3** - Final validation
8. **Return Safe Image** - Or error if unsafe

## 🎯 **Result**

Your iOS app now generates **100% safe baby images** with automatic content moderation!
