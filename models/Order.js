// models/Order.js - Updated
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // Razorpay order details
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  paymentId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  
  // Customer details - UPDATED
  customer: {
    userId: String, // Add this field
    name: String,
    email: String,
    phone: String
  },
  
  // Shipping address
  shippingAddress: {
    fullName: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    country: {
      type: String,
      default: 'India'
    },
    phone: String
  },
  
  // Order items
  items: [{
    productId: String,
    title: String,
    price: Number,
    discountedPrice: Number,
    quantity: Number,
    size: String,
    rated: {
      type: Boolean,
      default: false
    },
    imageUrl: String
  }],
  
  // Payment method - ADD THIS
  paymentMethod: {
    type: String,
    default: 'Online Payment'
  },
  
  // Shipping details
  shipping: {
    waybill: String,
    courier: {
      type: String,
      default: 'Delhivery'
    },
    status: {
      type: String,
      default: 'order_placed',
      enum: ['order_placed', 'shipment_created', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled']
    },
    trackingUrl: String,
    shipmentCreatedAt: Date,
    deliveredAt: Date,
    expectedDelivery: Date // ADD THIS
  },
  
  // Order status
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded']
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
orderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Set expected delivery date if not set (7 days from creation)
  if (!this.shipping.expectedDelivery && this.createdAt) {
    this.shipping.expectedDelivery = new Date(this.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  
  next();
});

module.exports = mongoose.model('Order', orderSchema);