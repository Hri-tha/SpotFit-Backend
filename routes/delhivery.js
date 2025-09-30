// routes/delhivery.js - UPDATED
const express = require('express');
const router = express.Router();
const axios = require('axios');

// Middleware to add Delhivery API key
const addDelhiveryAuth = (req, res, next) => {
  req.delhiveryAuth = {
    headers: {
      'Authorization': `Token ${process.env.DELHIVERY_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };
  next();
};

// Proxy for Delhivery PIN code serviceability check - FIXED
router.get('/pin/:pincode', addDelhiveryAuth, async (req, res) => {
  try {
    const { pincode } = req.params;
    
    const response = await axios.get(
      `https://track.delhivery.com/c/api/pin-codes/json/?filter_codes=${pincode}`,
      req.delhiveryAuth
    );

    console.log('📦 Raw Delhivery API Response:', response.data);

    // Transform the response to match what frontend expects
    const transformedResponse = transformDelhiveryResponse(response.data, pincode);
    
    res.json(transformedResponse);
  } catch (error) {
    console.error('Delhivery API error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch delivery information',
      details: error.response?.data || error.message
    });
  }
});

// Helper function to transform Delhivery response
function transformDelhiveryResponse(apiResponse, pincode) {
  // If API returns error or no data
  if (!apiResponse || apiResponse.success === false) {
    return {
      deliverable: false,
      pin: pincode,
      error: apiResponse?.error || 'No serviceability data'
    };
  }

  // Check if we have delivery_codes array with data
  if (apiResponse.delivery_codes && apiResponse.delivery_codes.length > 0) {
    const postalCode = apiResponse.delivery_codes[0].postal_code;
    
    // Serviceable if prepaid or COD is available
    const isServiceable = postalCode.pre_paid === 'Y' || postalCode.cod === 'Y';
    
    return {
      deliverable: isServiceable,
      cash: postalCode.cash === 'Y',
      prepaid: postalCode.pre_paid === 'Y',
      cod: postalCode.cod === 'Y',
      pickup: postalCode.pickup === 'Y',
      country: postalCode.country_code || 'IN',
      pin: postalCode.pin.toString(),
      state: postalCode.state_code,
      city: postalCode.city,
      routing_code: postalCode.sort_code,
      zone: postalCode.is_oda === 'N' ? 'Regular' : 'ODA',
      is_oda: postalCode.is_oda,
      reassign: postalCode.repl === 'Y',
      forward: true, // Default
      rto: true, // Default
      // Include original data for debugging
      original_data: postalCode
    };
  }

  // Default fallback
  return {
    deliverable: false,
    pin: pincode,
    error: 'No serviceability information found'
  };
}

// Alternative endpoint using serviceability API
router.get('/pincodes/:pincode', addDelhiveryAuth, async (req, res) => {
  try {
    const { pincode } = req.params;
    
    const response = await axios.get(
      `https://track.delhivery.com/api/dc/fetch/serviceability/pincode?filter_codes=${pincode}`,
      req.delhiveryAuth
    );

    console.log('🔧 Serviceability API Response:', response.data);
    
    // Transform this response too
    const transformedResponse = transformServiceabilityResponse(response.data, pincode);
    res.json(transformedResponse);
  } catch (error) {
    console.error('Delhivery serviceability error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch serviceability information'
    });
  }
});

// Helper for serviceability API response
function transformServiceabilityResponse(apiResponse, pincode) {
  // This API might have different structure, adjust as needed
  if (apiResponse && apiResponse.deliverable !== undefined) {
    return apiResponse; // Already in correct format
  }
  
  // Fallback transformation
  return {
    deliverable: false,
    pin: pincode,
    error: 'Serviceability check failed'
  };
}

// ... rest of your existing routes (track, shipment, charges) remain the same
router.get('/track/:waybill', addDelhiveryAuth, async (req, res) => {
  try {
    const { waybill } = req.params;
    
    const response = await axios.get(
      `https://track.delhivery.com/api/v1/packages/json/?waybill=${waybill}&verbose=2`,
      req.delhiveryAuth
    );

    res.json(response.data);
  } catch (error) {
    console.error('Delhivery tracking error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch tracking information'
    });
  }
});

// Create shipment
// routes/delhivery.js - FIXED SHIPMENT CREATION
router.post('/shipment/create', addDelhiveryAuth, async (req, res) => {
  try {
    console.log('🚚 Creating Delhivery shipment with data:', JSON.stringify(req.body, null, 2));
    
    // Add required format parameter and restructure data
    const delhiveryData = {
      format: 'json', // Required parameter
      data: JSON.stringify({
        pickups: [req.body.pickup_location],
        shipments: req.body.shipments
      })
    };

    console.log('📦 Sending to Delhivery:', JSON.stringify(delhiveryData, null, 2));
    
    const response = await axios.post(
      'https://track.delhivery.com/api/cmu/create.json',
      delhiveryData,
      {
        ...req.delhiveryAuth,
        headers: {
          ...req.delhiveryAuth.headers,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log('✅ Delhivery API Response:', response.data);
    
    res.json(response.data);
  } catch (error) {
    console.error('❌ Delhivery shipment creation error:', error.response?.data || error.message);
    
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to create shipment',
      details: error.response?.data || error.message
    });
  }
});
// Test shipment creation endpoint
// router.post('/shipment/test', addDelhiveryAuth, async (req, res) => {
//   try {
//     // Test with minimal data
//     const testData = {
//       "shipments": [
//         {
//           "name": "John Doe",
//           "add": "123 Main Street",
//           "pin": "560029",
//           "city": "Bangalore",
//           "state": "Karnataka",
//           "country": "India",
//           "phone": "9876543210",
//           "order": "TEST_ORDER_123",
//           "products_desc": "Test Product",
//           "cod_amount": "0",
//           "total_amount": "499",
//           "quantity": "1"
//         }
//       ],
//       "pickup_location": {
//         "name": environment.delhivery.sellerName,
//         "add": environment.delhivery.sellerAddress,
//         "city": environment.delhivery.sellerCity,
//         "pin_code": environment.delhivery.sellerPincode,
//         "state": environment.delhivery.sellerState,
//         "phone": environment.delhivery.sellerPhone,
//         "country": "India"
//       }
//     };

//     console.log('🧪 Testing shipment with data:', JSON.stringify(testData, null, 2));
    
//     const response = await axios.post(
//       'https://track.delhivery.com/api/cmu/create.json',
//       testData,
//       req.delhiveryAuth
//     );

//     res.json({
//       success: true,
//       message: 'Test shipment created successfully',
//       data: response.data
//     });
//   } catch (error) {
//     console.error('❌ Test shipment failed:', error.response?.data || error.message);
//     res.status(error.response?.status || 500).json({
//       success: false,
//       error: 'Test shipment failed',
//       details: error.response?.data || error.message
//     });
//   }
// });


// Get shipping charges
router.get('/charges', addDelhiveryAuth, async (req, res) => {
  try {
    const { pincode, weight = '0.5' } = req.query;
    
    const response = await axios.get(
      `https://track.delhivery.com/api/kinko/v1/invoice/charges/.json?md=o&ss=Y&d_pin=${pincode}&payment_mode=P&weight=${weight}`,
      req.delhiveryAuth
    );

    res.json(response.data);
  } catch (error) {
    console.error('Delhivery charges error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch shipping charges'
    });
  }
});

module.exports = router;