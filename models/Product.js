const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  imageUrl: String,
  category: String,
  available: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  features: { type: [String], default: [] }, 
  quantity: { type: Number, default: 0 }, 
  sizes: { type: [String], default: [] },  
  discount: { type: Number, default: 0 },
  type: { 
    type: String, 
    enum: ['Lower', 'Sando', 'Nikker', 'T-Shirt', 'New Arrivals'], 
    required: true 
  } // ✅ new field
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
