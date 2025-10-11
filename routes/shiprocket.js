// routes/shiprocket.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const axios = require('axios');

let shiprocketToken = null;
let tokenExpiry = null;

// Middleware to get Shiprocket token
const getShiprocketToken = async () => {
  // Check if token exists and is not expired (valid for 10 days)
  if (shiprocketToken && tokenExpiry && Date.now() < tokenExpiry) {
    return shiprocketToken;
  }

  try {
    console.log('🔑 Getting new Shiprocket token...');
    
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD
    });

    if (response.data.token) {
      shiprocketToken = response.data.token;
      // Set token expiry (10 days from now)
      tokenExpiry = Date.now() + (10 * 24 * 60 * 60 * 1000);
      console.log('✅ New Shiprocket token acquired');
      return shiprocketToken;
    } else {
      throw new Error('No token in response');
    }
  } catch (error) {
    console.error('❌ Shiprocket authentication failed:', error.response?.data || error.message);
    throw error;
  }
};

// Middleware to add Shiprocket auth headers
const addShiprocketAuth = async (req, res, next) => {
  try {
    const token = await getShiprocketToken();
    req.shiprocketAuth = {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    next();
  } catch (error) {
    res.status(401).json({
      error: 'Shiprocket authentication failed',
      details: error.response?.data || error.message
    });
  }
};

// Check serviceability
router.get('/serviceability/:pincode', addShiprocketAuth, async (req, res) => {
  try {
    const { pincode } = req.params;
    const { weight = 0.5, cod = 0 } = req.query;

    console.log('📍 Checking Shiprocket serviceability for:', { pincode, weight, cod });

    const response = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/courier/serviceability`,
      {
        ...req.shiprocketAuth,
        params: {
          pickup_postcode: process.env.SHIPROCKET_PICKUP_PINCODE || '110089',
          delivery_postcode: pincode,
          weight: weight,
          cod: cod,
          order_type: 'NDD'
        }
      }
    );

    console.log('📦 Shiprocket serviceability response:', response.data);

    if (response.data.data && response.data.data.available_courier_companies) {
      const couriers = response.data.data.available_courier_companies;
      
      if (couriers.length > 0) {
        // Return the first available courier
        const firstCourier = couriers[0];
        res.json({
          available: true,
          estimated_days: firstCourier.estimated_delivery_days,
          charge: firstCourier.freight_charge,
          courier_company_id: firstCourier.courier_company_id,
          courier_name: firstCourier.courier_name,
          all_couriers: couriers
        });
      } else {
        res.json({
          available: false,
          reason: 'No couriers available for this pincode'
        });
      }
    } else {
      res.json({
        available: false,
        reason: 'Serviceability check failed'
      });
    }
  } catch (error) {
    console.error('❌ Shiprocket serviceability error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to check serviceability',
      details: error.response?.data || error.message
    });
  }
});

// Create order
router.post('/orders/create', addShiprocketAuth, async (req, res) => {
  try {
    console.log('🚚 Creating Shiprocket order:', JSON.stringify(req.body, null, 2));

    const response = await axios.post(
      'https://apiv2.shiprocket.in/v1/external/orders/create/adhoc',
      req.body,
      req.shiprocketAuth
    );

    console.log('✅ Shiprocket order created:', response.data);

    res.json({
      success: true,
      ...response.data
    });
  } catch (error) {
    console.error('❌ Shiprocket order creation error:', error.response?.data || error.message);
    
    // Log the available pickup locations if provided in error response
    if (error.response?.data?.data?.data) {
      console.log('📋 Available Pickup Locations:', error.response.data.data.data);
    }
    
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to create order',
      details: error.response?.data || error.message
    });
  }
});

// Assign AWB
router.post('/awb/assign', addShiprocketAuth, async (req, res) => {
  try {
    const { shipment_id, courier_id } = req.body;

    console.log('🏷️ Assigning AWB:', { shipment_id, courier_id });

    const response = await axios.post(
      'https://apiv2.shiprocket.in/v1/external/courier/assign/awb',
      {
        shipment_id: shipment_id,
        courier_id: courier_id
      },
      req.shiprocketAuth
    );

    console.log('✅ AWB assigned:', response.data);

    res.json({
      success: true,
      ...response.data
    });
  } catch (error) {
    console.error('❌ AWB assignment error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to assign AWB',
      details: error.response?.data || error.message
    });
  }
});

// Generate pickup
router.post('/pickup/generate', addShiprocketAuth, async (req, res) => {
  try {
    const { shipment_id } = req.body;

    if (!shipment_id || !Array.isArray(shipment_id) || shipment_id.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'shipment_id array is required'
      });
    }

    console.log('📦 Generating pickup for shipments:', shipment_id);

    const response = await axios.post(
      'https://apiv2.shiprocket.in/v1/external/courier/generate/pickup',
      {
        shipment_id: shipment_id
      },
      req.shiprocketAuth
    );

    console.log('✅ Pickup generated:', response.data);

    res.json({
      success: true,
      ...response.data
    });
  } catch (error) {
    console.error('❌ Pickup generation error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to generate pickup',
      details: error.response?.data || error.message
    });
  }
});

// Track shipment
router.get('/track/:awb', addShiprocketAuth, async (req, res) => {
  try {
    const { awb } = req.params;

    console.log('📋 Tracking AWB:', awb);

    const response = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`,
      req.shiprocketAuth
    );

    res.json({
      success: true,
      ...response.data
    });
  } catch (error) {
    console.error('❌ Tracking error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to track shipment',
      details: error.response?.data || error.message
    });
  }
});

// Generate label
router.get('/label/generate', addShiprocketAuth, async (req, res) => {
  try {
    const { shipment_id } = req.query;

    if (!shipment_id) {
      return res.status(400).json({
        success: false,
        error: 'shipment_id is required'
      });
    }

    console.log('🏷️ Generating label for shipment:', shipment_id);

    const response = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/courier/generate/label`,
      {
        ...req.shiprocketAuth,
        params: {
          shipment_id: shipment_id
        }
      }
    );

    res.json({
      success: true,
      ...response.data
    });
  } catch (error) {
    console.error('❌ Label generation error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to generate label',
      details: error.response?.data || error.message
    });
  }
});

// Generate invoice
router.get('/invoice/generate', addShiprocketAuth, async (req, res) => {
  try {
    const { order_id } = req.query;

    if (!order_id) {
      return res.status(400).json({
        success: false,
        error: 'order_id is required'
      });
    }

    console.log('🧾 Generating invoice for order:', order_id);

    const response = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/orders/print/invoice`,
      {
        ...req.shiprocketAuth,
        params: {
          order_id: order_id
        }
      }
    );

    res.json({
      success: true,
      ...response.data
    });
  } catch (error) {
    console.error('❌ Invoice generation error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to generate invoice',
      details: error.response?.data || error.message
    });
  }
});

// Cancel shipment
router.post('/shipment/cancel', addShiprocketAuth, async (req, res) => {
  try {
    const { shipment_id } = req.body;

    if (!shipment_id) {
      return res.status(400).json({
        success: false,
        error: 'shipment_id is required'
      });
    }

    console.log('❌ Canceling shipment:', shipment_id);

    const response = await axios.post(
      'https://apiv2.shiprocket.in/v1/external/orders/cancel',
      {
        shipment_id: shipment_id
      },
      req.shiprocketAuth
    );

    res.json({
      success: true,
      ...response.data
    });
  } catch (error) {
    console.error('❌ Shipment cancellation error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to cancel shipment',
      details: error.response?.data || error.message
    });
  }
});

// Get pickup locations
router.get('/pickup-locations', addShiprocketAuth, async (req, res) => {
  try {
    console.log('📋 Fetching pickup locations...');
    
    // Try to get pickup locations from Shiprocket
    const response = await axios.get(
      'https://apiv2.shiprocket.in/v1/external/settings/company/pickup',
      req.shiprocketAuth
    );

    console.log('✅ Pickup locations fetched:', response.data);

    if (response.data.data && response.data.data.pickup_address) {
      // FIXED: Remove TypeScript syntax
      const locations = response.data.data.pickup_address.map((loc) => ({
        name: loc.pickup_location,
        address: loc.address,
        city: loc.city,
        pincode: loc.pin_code,
        state: loc.state
      }));
      
      res.json({
        success: true,
        data: locations
      });
    } else {
      res.json({
        success: true,
        data: []
      });
    }
  } catch (error) {
    console.error('❌ Failed to fetch pickup locations:', error.response?.data || error.message);
    
    // Return empty array if failed
    res.json({
      success: true,
      data: []
    });
  }
});

// Quick test endpoint to find correct pickup location
router.get('/test-pickup-locations', addShiprocketAuth, async (req, res) => {
  try {
    console.log('🧪 Testing pickup locations...');
    
    const testLocations = [
      'Home', 'home', 'Primary', 'primary', 'Default', 'default',
      'Warehouse', 'warehouse', 'Office', 'office', 'Store', 'store',
      'SpotFit', 'spotfit', 'SpotFit_Warehouse', 'Aashunit', 'Rohini', 'Delhi'
    ];
    
    const results = [];
    
    for (const location of testLocations) {
      try {
        const testOrderData = {
          order_id: `TEST_${Date.now()}_${location.replace(/\s+/g, '_')}`,
          order_date: new Date().toISOString().split('T')[0],
          pickup_location: location,
          billing_customer_name: 'Test Customer',
          billing_last_name: '',
          billing_address: 'Test Address',
          billing_city: 'Delhi',
          billing_pincode: '110001',
          billing_state: 'Delhi',
          billing_country: 'India',
          billing_email: 'test@example.com',
          billing_phone: '9999999999',
          shipping_is_billing: true,
          order_items: [{
            name: 'Test Product',
            sku: 'TEST_SKU_001',
            units: 1,
            selling_price: 100,
            discount: 0,
            tax: 0,
            hsn: 6115
          }],
          payment_method: 'Prepaid',
          sub_total: 100,
          weight: 0.5
        };

        const response = await axios.post(
          'https://apiv2.shiprocket.in/v1/external/orders/create/adhoc',
          testOrderData,
          req.shiprocketAuth
        );

        results.push({
          location: location,
          status: 'SUCCESS',
          order_id: response.data.order_id,
          shipment_id: response.data.shipment_id
        });
        
        break; // Stop if one works
        
      } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        results.push({
          location: location,
          status: 'FAILED',
          error: errorMsg
        });
        
        // Log available locations if provided
        if (error.response?.data?.data?.data) {
          const availableLocs = error.response.data.data.data.map(loc => loc.name || loc.pickup_location);
          console.log(`📍 Available locations for "${location}":`, availableLocs);
          results[results.length - 1].available_locations = availableLocs;
        }
      }
      
      // Small delay between attempts
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    res.json({
      success: true,
      test_results: results
    });
    
  } catch (error) {
    console.error('❌ Pickup location test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Test failed',
      details: error.message
    });
  }
});

// Add this to your shiprocket.js routes

// 🧪 Test endpoint to find the correct pickup location
router.get('/test/find-pickup-location', addShiprocketAuth, async (req, res) => {
  try {
    console.log('🔍 Finding correct pickup location...');
    
    // Get all pickup locations
    const response = await axios.get(
      'https://apiv2.shiprocket.in/v1/external/settings/company/pickup',
      req.shiprocketAuth
    );

    console.log('📋 Raw Shiprocket Response:', JSON.stringify(response.data, null, 2));

    if (response.data && response.data.data && response.data.data.shipping_address) {
      const locations = response.data.data.shipping_address;
      
      const formattedLocations = locations.map(loc => ({
        pickup_location_name: loc.pickup_location,
        address: loc.address,
        city: loc.city,
        pincode: loc.pin_code,
        phone: loc.phone,
        id: loc.id
      }));

      res.json({
        success: true,
        message: 'Use the "pickup_location_name" value in your order creation',
        locations: formattedLocations,
        instruction: 'Copy the exact pickup_location_name from above and use it in your order API call'
      });

    } else {
      res.json({
        success: false,
        message: 'No pickup locations found',
        raw_response: response.data
      });
    }

  } catch (error) {
    console.error('❌ Error fetching pickup locations:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pickup locations',
      details: error.response?.data || error.message
    });
  }
});

// Alternative: Direct test with order creation attempts
router.get('/test/try-pickup-locations', addShiprocketAuth, async (req, res) => {
  const testLocations = [
    'Home', 'home', 
    'Primary', 'primary',
    'Default', 'default',
    'Warehouse', 'warehouse',
    'Main', 'main',
    'Office', 'office'
  ];

  const results = [];

  for (const location of testLocations) {
    try {
      // Create minimal test order
      const testOrder = {
        order_id: `TEST_${Date.now()}_${location}`,
        order_date: new Date().toISOString().split('T')[0],
        pickup_location: location,
        billing_customer_name: 'Test',
        billing_last_name: 'Customer',
        billing_address: 'Test Address',
        billing_city: 'Delhi',
        billing_pincode: '110001',
        billing_state: 'Delhi',
        billing_country: 'India',
        billing_email: 'test@test.com',
        billing_phone: '9999999999',
        shipping_is_billing: true,
        order_items: [{
          name: 'Test Product',
          sku: 'TEST001',
          units: 1,
          selling_price: 100,
          discount: 0,
          tax: 0,
          hsn: 6115
        }],
        payment_method: 'Prepaid',
        sub_total: 100,
        weight: 0.5,
        length: 10,
        breadth: 10,
        height: 2
      };

      const response = await axios.post(
        'https://apiv2.shiprocket.in/v1/external/orders/create/adhoc',
        testOrder,
        req.shiprocketAuth
      );

      results.push({
        location: location,
        status: '✅ SUCCESS',
        message: 'This is the correct pickup location!',
        order_id: response.data.order_id,
        shipment_id: response.data.shipment_id
      });

      // If one succeeds, that's our answer
      break;

    } catch (error) {
      results.push({
        location: location,
        status: '❌ FAILED',
        error: error.response?.data?.message || error.message
      });
    }

    // Small delay between attempts
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  res.json({
    success: true,
    results: results,
    instruction: 'Look for the location with "✅ SUCCESS" - that is your correct pickup location name'
  });
});

module.exports = router;