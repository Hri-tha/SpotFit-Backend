// routes/product.js
const express = require('express');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ================== File Upload Setup ==================
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

// ================== Helper ==================
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

// ================== Routes ==================

// Upload multiple images
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

// Create product
router.post('/', auth, isAdmin, upload.array('images', 10), async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      category,
      featured,
      features,
      quantity,
      sizes,
      discount,
      type,
      heroBanner,
      bannerOrder
    } = req.body;

    const imageUrls = req.files
      ? req.files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`)
      : req.body.imageUrl
        ? [req.body.imageUrl]
        : [];

    const product = new Product({
      title,
      description,
      price: Number(price) || 0,
      category,
      imageUrl: imageUrls[0] || '', // first image
      images: imageUrls,            // all images
      featured: featured === 'true' || featured === true,
      heroBanner: heroBanner === 'true' || heroBanner === true,
      bannerOrder: Number(bannerOrder) || 0,
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

// Hero Banner
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

// Update product
router.put('/:id', auth, isAdmin, upload.single('image'), async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      category,
      featured,
      features,
      quantity,
      sizes,
      discount,
      type
    } = req.body;

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

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Not found' });
    res.json(p);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete product
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Rate a product
router.post('/:id/rate', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, review, orderId } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const Order = require('../models/Order');
    const order = await Order.findOne({
      _id: orderId,
      'customer.email': req.user.email
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found or you did not purchase this product' });
    }

    const orderItem = order.items.find(item => item.productId === id);
    if (!orderItem) {
      return res.status(400).json({ message: 'This product was not in your order' });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const existingRating = product.ratings.find(r =>
      r.userId.toString() === userId && r.orderId === orderId
    );
    if (existingRating) {
      return res.status(400).json({ message: 'You have already rated this product for this order' });
    }

    product.ratings.push({ userId, rating, review, orderId });

    const totalRatings = product.ratings.length;
    const sumRatings = product.ratings.reduce((sum, r) => sum + r.rating, 0);
    product.averageRating = totalRatings > 0 ? sumRatings / totalRatings : 0;
    product.totalRatings = totalRatings;

    await product.save();

    const orderItemToUpdate = order.items.find(item => item.productId === id);
    if (orderItemToUpdate) {
      orderItemToUpdate.rated = true;
      await order.save();
    }

    res.json(product);
  } catch (err) {
    console.error('❌ Error submitting rating:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get user's rating for a product
router.get('/:id/user-rating', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const userRating = product.ratings.find(r => r.userId.toString() === userId);
    if (!userRating) return res.status(200).json(null);

    res.json({
      rating: userRating.rating,
      review: userRating.review,
      orderId: userRating.orderId,
      createdAt: userRating.createdAt
    });
  } catch (err) {
    console.error('❌ Error fetching user rating:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Check if user can rate a product
router.get('/:id/can-rate', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const Order = require('../models/Order');

    const orders = await Order.find({
      'customer.email': req.user.email,
      'items.productId': id,
      status: 'delivered'
    });

    if (orders.length === 0) {
      return res.json({ canRate: false, message: 'Product not purchased or not delivered yet' });
    }

    const product = await Product.findById(id);
    const alreadyRated = product.ratings.some(r =>
      r.userId.toString() === userId &&
      orders.some(order => order._id.toString() === r.orderId)
    );

    if (alreadyRated) {
      return res.json({ canRate: false, message: 'Already rated this product' });
    }

    res.json({ canRate: true, orderId: orders[0]._id });
  } catch (err) {
    console.error('❌ Error checking rating eligibility:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get all ratings for a product (public)
router.get('/:id/ratings', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id)
      .populate('ratings.userId', 'name email')
      .select('ratings averageRating totalRatings');

    if (!product) return res.status(404).json({ message: 'Product not found' });

    res.json({
      ratings: product.ratings,
      averageRating: product.averageRating,
      totalRatings: product.totalRatings
    });
  } catch (err) {
    console.error('❌ Error fetching product ratings:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
