// models/Product.js - UPDATED
const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    maxlength: 500
  },
  orderId: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const productSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  images: { type: [String], default: [] },
  category: String,
  available: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  heroBanner: { type: Boolean, default: false },
  bannerOrder: { type: Number, default: 0 },
  features: { type: [String], default: [] }, 
  quantity: { type: Number, default: 0 }, 
  sizes: { type: [String], default: [] },  
  discount: { type: Number, default: 0 },
  type: { 
    type: String, 
    enum: ['Lower', 'Sando', 'Nikker', 'T-Shirt', 'New Arrivals'], 
    required: true 
  },
  // ✅ NEW: Ratings array
  ratings: [ratingSchema],
  // ✅ NEW: Average rating (cached for performance)
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  // ✅ NEW: Total ratings count
  totalRatings: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);