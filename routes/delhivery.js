// routes/delhivery.js - FIXED WITH AUTO PICKUP
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

// Proxy for Delhivery PIN code serviceability check
router.get('/pin/:pincode', addDelhiveryAuth, async (req, res) => {
  try {
    const { pincode } = req.params;
    
    const response = await axios.get(
      `https://track.delhivery.com/c/api/pin-codes/json/?filter_codes=${pincode}`,
      req.delhiveryAuth
    );

    console.log('📦 Raw Delhivery API Response:', response.data);

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
  if (!apiResponse || apiResponse.success === false) {
    return {
      deliverable: false,
      pin: pincode,
      error: apiResponse?.error || 'No serviceability data'
    };
  }

  if (apiResponse.delivery_codes && apiResponse.delivery_codes.length > 0) {
    const postalCode = apiResponse.delivery_codes[0].postal_code;
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
      forward: true,
      rto: true,
      original_data: postalCode
    };
  }

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
  if (apiResponse && apiResponse.deliverable !== undefined) {
    return apiResponse;
  }
  
  return {
    deliverable: false,
    pin: pincode,
    error: 'Serviceability check failed'
  };
}

// Track shipment
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

// 🔥 FIXED: Create shipment AND automatically add to pickup
router.post('/shipment/create', addDelhiveryAuth, async (req, res) => {
  try {
    console.log('🚚 Creating Delhivery shipment with data:', JSON.stringify(req.body, null, 2));
    
    const delhiveryData = {
      format: 'json',
      data: JSON.stringify({
        pickups: [req.body.pickup_location],
        shipments: req.body.shipments
      })
    };

    console.log('📦 Sending to Delhivery:', JSON.stringify(delhiveryData, null, 2));
    
    // STEP 1: Create the shipment
    const shipmentResponse = await axios.post(
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

    console.log('✅ Shipment Created:', shipmentResponse.data);
    
    // Extract waybill from response
    let waybill = null;
    if (shipmentResponse.data.packages && shipmentResponse.data.packages.length > 0) {
      waybill = shipmentResponse.data.packages[0].waybill;
    } else if (shipmentResponse.data.waybill) {
      waybill = shipmentResponse.data.waybill;
    }

    // STEP 2: Automatically add to pickup if waybill exists
    let pickupResponse = null;
    if (waybill) {
      try {
        console.log('📦 Waybill generated:', waybill);
        console.log('⏱️ Waiting 5 seconds for waybill to be fully registered...');
        
        // Wait for waybill to be fully registered in Delhivery system
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Calculate tomorrow's date for pickup
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const pickupDate = tomorrow.toISOString().split('T')[0];

        console.log('📦 Step 1: Creating pickup request without waybill first...');

        // STEP 2A: Create pickup request WITHOUT waybills first
        const initialPickupData = {
          pickup_location: req.body.pickup_location?.name || 'SpotFit',
          pickup_date: pickupDate,
          pickup_time: '14:00:00',
          expected_package_count: 1
          // NOTE: NO waybills in initial request
        };

        pickupResponse = await axios.post(
          'https://track.delhivery.com/fm/request/new/',
          initialPickupData,
          req.delhiveryAuth
        );

        console.log('✅ Pickup Request Created (without waybill):', pickupResponse.data);
        
        if (pickupResponse.data.pickup_id) {
          console.log('📦 Step 2: Now adding waybill to pickup via edit API...');
          
          // STEP 2B: Add waybill to existing pickup using EDIT endpoint
          try {
            // Wait another 2 seconds before adding waybill
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const addWaybillResponse = await axios.post(
              'https://track.delhivery.com/fm/request/edit/',
              {
                pickup_id: pickupResponse.data.pickup_id,
                waybills: [waybill],
                action: 'add'
              },
              req.delhiveryAuth
            );

            console.log('✅ Waybill added to pickup via edit:', addWaybillResponse.data);
            console.log(`✅ Waybill ${waybill} successfully added to pickup ${pickupResponse.data.pickup_id}`);
            
            // Update pickupResponse with edit confirmation
            pickupResponse.data.waybills_added = true;
            pickupResponse.data.waybill = waybill;
            
          } catch (editError) {
            console.error('⚠️ Failed to add waybill via edit API:', editError.response?.data || editError.message);
            console.log('💡 Fallback: Will use manual "Add to Pickup" in Delhivery dashboard');
          }
        }
        
      } catch (pickupError) {
        console.error('⚠️ Pickup request creation failed:', pickupError.response?.data || pickupError.message);
        console.log('💡 Manual intervention required: Add waybill', waybill, 'to pickup manually');
      }
    }

    // Return combined response
    res.json({
      success: true,
      shipment: shipmentResponse.data,
      pickup: pickupResponse ? pickupResponse.data : null,
      waybill: waybill,
      message: pickupResponse 
        ? 'Shipment created and added to pickup successfully'
        : 'Shipment created (pickup request pending)'
    });

  } catch (error) {
    console.error('❌ Delhivery shipment creation error:', error.response?.data || error.message);
    
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to create shipment',
      details: error.response?.data || error.message
    });
  }
});

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

// Create pickup request (manual - for when auto-pickup wasn't done)
router.post('/pickup/request', addDelhiveryAuth, async (req, res) => {
  try {
    const { pickup_location, pickup_date, pickup_time, expected_package_count, waybills } = req.body;

    console.log('📦 Creating pickup request:', { pickup_location, pickup_date, pickup_time, waybills });

    // Calculate tomorrow's date if not provided
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultPickupDate = tomorrow.toISOString().split('T')[0];

    const pickupData = {
      pickup_location: pickup_location || 'SpotFit',
      pickup_date: pickup_date || defaultPickupDate,
      pickup_time: pickup_time || '14:00:00',
      expected_package_count: expected_package_count || (waybills?.length || 1),
    };

    // Include waybills if provided
    if (waybills && Array.isArray(waybills) && waybills.length > 0) {
      pickupData.waybills = waybills;
    }

    const response = await axios.post(
      'https://track.delhivery.com/fm/request/new/',
      pickupData,
      req.delhiveryAuth
    );

    console.log('✅ Pickup request created:', response.data);

    res.json({
      success: true,
      data: response.data,
      message: waybills?.length
        ? `${waybills.length} shipment(s) added to pickup successfully`
        : 'Pickup request created successfully'
    });
  } catch (error) {
    console.error('❌ Pickup request error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to create pickup request',
      details: error.response?.data || error.message
    });
  }
});

// Add specific waybills to pickup (for existing orders)
router.post('/pickup/add-waybills', addDelhiveryAuth, async (req, res) => {
  try {
    const { waybills, pickup_date, pickup_time, pickup_id } = req.body;

    if (!waybills || !Array.isArray(waybills) || waybills.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'waybills array is required'
      });
    }

    console.log('📦 Adding waybills to pickup:', { waybills, pickup_id });

    // If pickup_id is provided, use edit endpoint
    if (pickup_id) {
      console.log('📝 Using EDIT endpoint to add waybills to existing pickup:', pickup_id);
      
      const editResponse = await axios.post(
        'https://track.delhivery.com/fm/request/edit/',
        {
          pickup_id: pickup_id,
          waybills: waybills,
          action: 'add'
        },
        req.delhiveryAuth
      );

      console.log('✅ Waybills added via edit:', editResponse.data);
      
      return res.json({
        success: true,
        data: editResponse.data,
        message: `${waybills.length} waybills added to pickup ${pickup_id} successfully`
      });
    }

    // Otherwise, create new pickup request
    console.log('📦 Creating new pickup request for waybills');
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultPickupDate = tomorrow.toISOString().split('T')[0];

    // Step 1: Create pickup WITHOUT waybills
    const pickupData = {
      pickup_location: 'SpotFit',
      pickup_date: pickup_date || defaultPickupDate,
      pickup_time: pickup_time || '14:00:00',
      expected_package_count: waybills.length
    };

    const createResponse = await axios.post(
      'https://track.delhivery.com/fm/request/new/',
      pickupData,
      req.delhiveryAuth
    );

    console.log('✅ Pickup created:', createResponse.data);

    // Step 2: Add waybills to the newly created pickup
    if (createResponse.data.pickup_id) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

      try {
        const editResponse = await axios.post(
          'https://track.delhivery.com/fm/request/edit/',
          {
            pickup_id: createResponse.data.pickup_id,
            waybills: waybills,
            action: 'add'
          },
          req.delhiveryAuth
        );

        console.log('✅ Waybills added to new pickup:', editResponse.data);

        return res.json({
          success: true,
          pickup: createResponse.data,
          edit: editResponse.data,
          message: `${waybills.length} waybills added to pickup ${createResponse.data.pickup_id} successfully`
        });
      } catch (editError) {
        console.error('⚠️ Failed to add waybills:', editError.response?.data);
        return res.json({
          success: false,
          pickup: createResponse.data,
          error: 'Pickup created but failed to add waybills',
          details: editError.response?.data
        });
      }
    }

    res.json({
      success: true,
      data: createResponse.data,
      message: 'Pickup created, add waybills manually'
    });

  } catch (error) {
    console.error('❌ Add to pickup error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to add waybills to pickup',
      details: error.response?.data || error.message
    });
  }
});

// Cancel shipment
router.post('/shipment/cancel', addDelhiveryAuth, async (req, res) => {
  try {
    const { waybill } = req.body;

    if (!waybill) {
      return res.status(400).json({
        success: false,
        error: 'waybill is required'
      });
    }

    const response = await axios.post(
      'https://track.delhivery.com/api/p/edit',
      { waybill, cancellation: true },
      req.delhiveryAuth
    );

    res.json({
      success: true,
      data: response.data,
      message: 'Shipment cancelled successfully'
    });
  } catch (error) {
    console.error('Shipment cancellation error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: 'Failed to cancel shipment',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;