const express = require('express');
const Product = require('../models/product');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 🔹 Ensure uploads folder exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// 🔹 Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// 🔹 Helper: safely parse JSON / arrays
function safeJsonParse(value, fallback) {
  try {
    if (!value) return fallback;
    const parsed = JSON.parse(value);
    // handle case: ["S, M, XL"] → split into ["S","M","XL"]
    if (Array.isArray(parsed) && parsed.length === 1 && parsed[0].includes(',')) {
      return parsed[0].split(',').map(s => s.trim());
    }
    return parsed;
  } catch {
    return fallback;
  }
}

// ✅ Create product
router.post('/', auth, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, description, price, category, featured, features, quantity, sizes, discount, type } = req.body;

    const imageUrl = req.file
      ? `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
      : req.body.imageUrl;

    const product = new Product({
      title,
      description,
      price: Number(price) || 0,
      category,
      imageUrl,
      featured: featured === 'true' || featured === true,
      features: safeJsonParse(features, []),
      quantity: Number(quantity) || 0,
      sizes: safeJsonParse(sizes, []),
      discount: Number(discount) || 0,
      type // ✅ include type
    });

    await product.save();
    res.status(201).json(product);
  } catch (err) {
    console.error('❌ Error creating product:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Update product
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
      type // ✅ include type
    };

    if (req.file) {
      updateData.imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    } else if (req.body.imageUrl) {
      updateData.imageUrl = req.body.imageUrl;
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updated);
  } catch (err) {
    console.error('❌ Error updating product:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// ✅ Get all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Get single product
router.get('/:id', async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Not found' });
    res.json(p);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Update product
router.put('/:id', auth, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { title, description, price, category, featured, features, quantity, sizes, discount } = req.body;

    const updateData = {
      title,
      description,
      price: Number(price) || 0,
      category,
      featured: featured === 'true' || featured === true,
      features: safeJsonParse(features, []),
      quantity: Number(quantity) || 0,
      sizes: safeJsonParse(sizes, []),
      discount: Number(discount) || 0
    };

    if (req.file) {
      updateData.imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    } else if (req.body.imageUrl) {
      updateData.imageUrl = req.body.imageUrl;
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updated);
  } catch (err) {
    console.error('❌ Error updating product:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Delete product
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
