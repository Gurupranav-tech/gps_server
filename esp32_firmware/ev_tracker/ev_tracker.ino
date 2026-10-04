#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <SparkFun_u-blox_GNSS_Arduino_Library.h>

// ==========================================
// 1. HARDWARE OBJECTS
// ==========================================
SFE_UBLOX_GNSS gps;

// ==========================================
// 2. SETTINGS & CREDENTIALS
// ==========================================
// --- Mobile Hotspot Credentials ---
const char* ssid = "Galaxy F23 5G11B8";       // Enter your hotspot name
const char* password = "12345678"; // Enter your hotspot password

// --- Backend Configuration ---
// MUST BE your laptop's IP address on the hotspot network (e.g., http://192.168.43.45:8000)
// DO NOT use 127.0.0.1
const char* serverUrlBase = "http://192.168.206.18:8000"; 
const String EV_ID = "EV-001";

// ==========================================
// 3. GLOBAL VARIABLES
// ==========================================
double lat = 0.0; 
double lng = 0.0;
String currentMessage = "";
bool gpsConnected = false;

// Timing variables
unsigned long lastGpsUpdate = 0;
unsigned long lastMessagePoll = 0;
const unsigned long GPS_INTERVAL = 3000;  // Send coordinates to API every 3 seconds
const unsigned long MSG_INTERVAL = 5000;  // Check for messages every 5 seconds

// ==========================================
// 4. MAIN SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  // --- Initialize I2C and GPS ---
  Wire.begin(); // SDA = 21, SCL = 22
  
  if (gps.begin() == false) {
    Serial.println("GPS not detected at default I2C address. Check wiring.");
    gpsConnected = false;
  } else {
    gps.setI2COutput(COM_TYPE_UBX); // Push data over I2C 
    gps.saveConfigSelective(VAL_CFG_SUBSEC_IOPORT); // Save to prevent resetting to default
    gpsConnected = true;
    Serial.println("NEO-M9N GPS Initialized via I2C.");
  }

  // --- Connect to Mobile Hotspot ---
  Serial.print("Connecting to Hotspot: ");
  Serial.println(ssid);
  
  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }

  if(WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.print("ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi Connection Failed. Please check Hotspot name/password.");
  }
}

// ==========================================
// 5. MAIN LOOP
// ==========================================
void loop() {
  // 1. Process GPS Data from I2C
  if (gpsConnected && gps.getPVT()) {
    long rawLat = gps.getLatitude();     
    long rawLon = gps.getLongitude();

    // Only update if we have a valid fix (non-zero coordinates)
    if (rawLat != 0 && rawLon != 0) {
      lat = rawLat / 10000000.0;
      lng = rawLon / 10000000.0;
    }
  }

  // 2. Send Location Data to Server
  if (millis() - lastGpsUpdate > GPS_INTERVAL) {
    lastGpsUpdate = millis();
    
    // Only send data to backend if we have a valid GPS lock
    if (lat != 0.0 && lng != 0.0) {
      if(WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        String url = String(serverUrlBase) + "/api/location";
        http.begin(url);
        http.addHeader("Content-Type", "application/json");
        
        String jsonPayload = "{\"ev_id\":\"" + EV_ID + "\",\"lat\":" + String(lat, 6) + ",\"lng\":" + String(lng, 6) + "}";
        
        int httpResponseCode = http.POST(jsonPayload);
        Serial.printf("POST Location [%d] | Lat: %f, Lng: %f\n", httpResponseCode, lat, lng);
        http.end();
      }
    } else {
      Serial.println("Waiting for GPS lock... Cannot POST location yet.");
    }
  }

  // 3. Receive Messages/Instructions from Server
  if (millis() - lastMessagePoll > MSG_INTERVAL) {
    lastMessagePoll = millis();
    
    if(WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      String url = String(serverUrlBase) + "/api/message/" + EV_ID;
      http.begin(url);
      
      int httpResponseCode = http.GET();
      if(httpResponseCode > 0){
        String payload = http.getString();
        
        // Basic JSON extraction: "message":"Content"
        int msgIndex = payload.indexOf("\"message\":\"");
        if(msgIndex > 0) {
          int startMsg = msgIndex + 11;
          int endMsg = payload.indexOf("\"", startMsg);
          String newMsg = payload.substring(startMsg, endMsg);
          
          if(newMsg.length() > 0 && newMsg != currentMessage) {
            currentMessage = newMsg;
            Serial.println("New Command Received: " + currentMessage);
          }
        }
      }
      http.end();
    }
  }
}