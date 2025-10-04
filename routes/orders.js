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

// Add this route to your orders.js file

// Get orders for current user
router.get('/user/orders', async (req, res) => {
  try {
    // In a real app, you'd get user ID from auth middleware
    // For now, we'll use a query parameter or return all orders
    const { userId, email, phone } = req.query;
    
    console.log('📋 Fetching user orders for:', { userId, email, phone });

    let query = {};
    
    // Build query based on available user identifiers
    if (userId) {
      query['customer.userId'] = userId;
    } else if (email) {
      query['customer.email'] = email;
    } else if (phone) {
      query['customer.phone'] = phone;
    }
    
    // If no specific user identifier, return empty array
    // In production, you should always have user authentication
    if (Object.keys(query).length === 0) {
      return res.json({
        success: true,
        data: {
          orders: [],
          message: 'No user identifier provided'
        }
      });
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .select('-__v') // Exclude version key
      .lean();

    console.log(`✅ Found ${orders.length} orders for user`);

    res.json({
      success: true,
      data: {
        orders: orders.map(order => ({
          _id: order._id,
          orderId: order.orderId,
          userId: order.customer?.userId,
          items: order.items,
          totalAmount: order.amount,
          status: order.status,
          paymentStatus: order.status === 'paid' || order.status === 'shipped' || order.status === 'delivered' ? 'paid' : 'pending',
          paymentMethod: 'Online Payment', // You can store this in your order model
          shippingAddress: order.shippingAddress,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          waybillNumber: order.shipping?.waybill,
          trackingUrl: order.shipping?.trackingUrl,
          expectedDelivery: order.shipping?.deliveredAt || 
            (order.createdAt ? new Date(order.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000) : null) // 7 days from order date
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user orders',
      details: error.message
    });
  }
});

// Alternative: Get orders by user email (common use case)
router.get('/user/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    console.log('📋 Fetching orders for email:', email);

    const orders = await Order.find({ 'customer.email': email })
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean();

    console.log(`✅ Found ${orders.length} orders for email: ${email}`);

    res.json({
      success: true,
      data: {
        orders: orders.map(order => ({
          _id: order._id,
          orderId: order.orderId,
          items: order.items,
          totalAmount: order.amount,
          status: order.status,
          paymentStatus: order.status === 'paid' || order.status === 'shipped' || order.status === 'delivered' ? 'paid' : 'pending',
          paymentMethod: 'Online Payment',
          shippingAddress: order.shippingAddress,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          waybillNumber: order.shipping?.waybill,
          trackingUrl: order.shipping?.trackingUrl,
          expectedDelivery: order.shipping?.deliveredAt || 
            (order.createdAt ? new Date(order.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000) : null)
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching user orders by email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user orders',
      details: error.message
    });
  }
});

// Add this temporary route to create a test order
router.post('/test-order', async (req, res) => {
  try {
    const testOrder = new Order({
      orderId: 'TEST_' + Date.now(),
      paymentId: 'TEST_PAY_' + Date.now(),
      amount: 1999,
      customer: {
        userId: 'test_user',
        name: 'Test User',
        email: 'test@example.com', // Use your test email
        phone: '9876543210'
      },
      shippingAddress: {
        fullName: 'Test User',
        addressLine1: '123 Test Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        phone: '9876543210'
      },
      items: [{
        productId: 'test_product_1',
        title: 'Test Fitness T-Shirt',
        price: 1999,
        discountedPrice: 1499,
        quantity: 1,
        size: 'M',
        imageUrl: 'assets/test-product.jpg'
      }],
      status: 'paid',
      shipping: {
        waybill: 'TEST123456789',
        status: 'in_transit',
        trackingUrl: 'https://track.delhivery.com/#/track/TEST123456789',
        expectedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now
      }
    });

    await testOrder.save();
    
    res.json({
      success: true,
      message: 'Test order created',
      data: testOrder
    });
  } catch (error) {
    console.error('Error creating test order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create test order'
    });
  }
});

// Add this route to debug - see all orders in database
router.get('/debug/all-orders', async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });
    
    console.log('📋 ALL ORDERS IN DATABASE:');
    orders.forEach(order => {
      console.log('Order:', {
        orderId: order.orderId,
        customer: order.customer,
        email: order.customer?.email,
        amount: order.amount,
        status: order.status,
        createdAt: order.createdAt
      });
    });

    res.json({
      success: true,
      data: {
        totalOrders: orders.length,
        orders: orders.map(order => ({
          orderId: order.orderId,
          customer: order.customer,
          email: order.customer?.email,
          amount: order.amount,
          status: order.status,
          items: order.items,
          createdAt: order.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching all orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
});

module.exports = router;