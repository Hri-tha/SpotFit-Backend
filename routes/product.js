// routes/product.js
const express = require('express');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { files: 10 } });

function safeJsonParse(value, fallback) {
  try {
    if (!value) return fallback;
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length === 1 && parsed[0].includes(',')) {
      return parsed[0].split(',').map(s => s.trim());
    }
    return parsed;
  } catch {
    return fallback;
  }
}

// ✅ NEW: Upload multiple images
router.post('/upload-multiple', auth, isAdmin, upload.array('images', 10), async (req, res) => {
  try {
    const imageUrls = req.files.map(file => 
      `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
    );
    res.json({ imageUrls });
  } catch (err) {
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});


router.post('/', auth, isAdmin, upload.array('images', 10), async (req, res) => {
  try {
    const { title, description, price, category, featured, features, quantity, sizes, discount, type, heroBanner, bannerOrder } = req.body;

    const imageUrls = req.files
      ? req.files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`)
      : req.body.imageUrl ? [req.body.imageUrl] : [];

    const product = new Product({
      title,
      description,
      price: Number(price) || 0,
      category,
      imageUrl: imageUrls[0] || '', // First image as main
      images: imageUrls, // ✅ All images
      featured: featured === 'true' || featured === true,
      heroBanner: heroBanner === 'true' || heroBanner === true, // ✅ Hero banner flag
      bannerOrder: Number(bannerOrder) || 0, // ✅ Banner order
      features: safeJsonParse(features, []),
      quantity: Number(quantity) || 0,
      sizes: safeJsonParse(sizes, []),
      discount: Number(discount) || 0,
      type
    });

    await product.save();
    res.status(201).json(product);
  } catch (err) {
    console.error('❌ Error creating product:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/banner/hero', async (req, res) => {
  try {
    const banners = await Product.find({ heroBanner: true })
      .sort({ bannerOrder: 1, createdAt: -1 })
      .select('title description imageUrl images');
    res.json(banners);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, description, price, category, featured, features, quantity, sizes, discount, type } = req.body;

    const updateData = {
      title,
      description,
      price: Number(price) || 0,
      category,
      featured: featured === 'true' || featured === true,
      features: safeJsonParse(features, []),
      quantity: Number(quantity) || 0,
      sizes: safeJsonParse(sizes, []),
      discount: Number(discount) || 0,
      type
    };

    if (req.file) {
      updateData.imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    } else if (req.body.imageUrl) {
      updateData.imageUrl = req.body.imageUrl;
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json(updated);
  } catch (err) {
    console.error('❌ Error updating product:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Not found' });
    res.json(p);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
