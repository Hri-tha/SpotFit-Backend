// routes/orders.js - PRODUCTION READY
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');

// Update shipment details
router.post('/update-shipment', async (req, res) => {
  try {
    const { orderId, waybill, courier, status } = req.body;
    
    console.log('📦 Updating shipment details:', { orderId, waybill, courier, status });

    // Validate required fields
    if (!orderId || !waybill) {
      return res.status(400).json({
        success: false,
        error: 'orderId and waybill are required'
      });
    }

    // Find and update the order
    const updatedOrder = await Order.findOneAndUpdate(
      { orderId: orderId },
      {
        $set: {
          'shipping.waybill': waybill,
          'shipping.courier': courier || 'Delhivery',
          'shipping.status': status || 'shipment_created',
          'shipping.trackingUrl': `https://track.delhivery.com/#/track/${waybill}`,
          'shipping.shipmentCreatedAt': new Date(),
          'status': 'shipped',
          'updatedAt': new Date()
        }
      },
      { new: true, upsert: false } // Don't create new if not found
    );

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    console.log('✅ Shipment details updated for order:', orderId);
    
    res.json({
      success: true,
      message: 'Shipment details updated successfully',
      data: {
        orderId: updatedOrder.orderId,
        waybill: updatedOrder.shipping.waybill,
        courier: updatedOrder.shipping.courier,
        status: updatedOrder.shipping.status,
        trackingUrl: updatedOrder.shipping.trackingUrl
      }
    });
  } catch (error) {
    console.error('Error updating shipment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update shipment details',
      details: error.message
    });
  }
});

// Create new order (call this after payment success)
router.post('/create', async (req, res) => {
  try {
    const {
      orderId,
      paymentId,
      amount,
      currency,
      customer,
      shippingAddress,
      items
    } = req.body;

    console.log('🛒 Creating new order:', orderId);

    // Validate required fields
    if (!orderId || !paymentId || !amount || !shippingAddress || !items) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, paymentId, amount, shippingAddress, items'
      });
    }

    // Check if order already exists
    const existingOrder = await Order.findOne({ orderId });
    if (existingOrder) {
      return res.status(409).json({
        success: false,
        error: 'Order already exists'
      });
    }

    // Create new order
    const newOrder = new Order({
      orderId,
      paymentId,
      amount,
      currency: currency || 'INR',
      customer: customer || {},
      shippingAddress,
      items,
      status: 'paid'
    });

    await newOrder.save();

    console.log('✅ Order created successfully:', orderId);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderId: newOrder.orderId,
        status: newOrder.status,
        createdAt: newOrder.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      details: error.message
    });
  }
});

// Get order details
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('📋 Fetching order details:', orderId);

    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: {
        order: {
          orderId: order.orderId,
          paymentId: order.paymentId,
          amount: order.amount,
          status: order.status,
          customer: order.customer,
          shippingAddress: order.shippingAddress,
          items: order.items,
          shipping: order.shipping,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order details',
      details: error.message
    });
  }
});

// Get all orders (for admin)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    const query = status ? { status } : {};
    
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: {
        orders,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
});

// Update order status
router.put('/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, trackingData } = req.body;

    const validStatuses = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const updateData = { status };
    
    // If delivered, set deliveredAt
    if (status === 'delivered') {
      updateData['shipping.deliveredAt'] = new Date();
    }
    
    // If tracking data provided, update shipping info
    if (trackingData) {
      updateData['shipping'] = { ...updateData.shipping, ...trackingData };
    }

    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      { $set: updateData },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        orderId: updatedOrder.orderId,
        status: updatedOrder.status,
        shipping: updatedOrder.shipping
      }
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update order status'
    });
  }
});

module.exports = router;