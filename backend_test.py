import requests
import sys
import json
from datetime import datetime, date, timedelta

class HennaLashAPITester:
    def __init__(self, base_url="https://henna-lash.onrender.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        self.test_results.append({
            "name": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, params=params, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)

            success = response.status_code == expected_status
            
            if success:
                self.log_test(name, True)
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, {}
            else:
                error_detail = f"Expected {expected_status}, got {response.status_code}"
                try:
                    error_detail += f" - {response.json()}"
                except:
                    error_detail += f" - {response.text[:200]}"
                self.log_test(name, False, error_detail)
                return False, {}

        except requests.exceptions.Timeout:
            self.log_test(name, False, "Request timeout (30s)")
            return False, {}
        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API", "GET", "", 200)

    def test_services_api(self):
        """Test services endpoint"""
        success, response = self.run_test("Services API", "GET", "services", 200)
        if success and response:
            expected_services = ["simple", "moyen", "charge", "mariee"]
            for service in expected_services:
                if service not in response:
                    self.log_test(f"Service {service} exists", False, f"Service {service} not found in response")
                else:
                    self.log_test(f"Service {service} exists", True)
        return success, response

    def test_reviews_api(self):
        """Test reviews endpoints"""
        # Test GET reviews (published only)
        success, reviews = self.run_test("Get Published Reviews", "GET", "reviews?published_only=true", 200)
        
        # Test GET all reviews (admin view)
        success2, all_reviews = self.run_test("Get All Reviews", "GET", "reviews?published_only=false", 200)
        
        # Test POST new review
        test_review = {
            "client_name": "Test Client",
            "service_type": "simple",
            "rating": 5,
            "comment": "Excellent service de test!"
        }
        success3, created_review = self.run_test("Create Review", "POST", "reviews", 200, test_review)
        
        return success and success2 and success3, created_review

    def test_client_login_api(self):
        """Test client login endpoint"""
        # Test with non-existent client
        test_login = {
            "email": "test@example.com",
            "phone": "0612345678"
        }
        success, response = self.run_test("Client Login (No appointments)", "POST", "client/login", 404, test_login)
        
        return success, response

    def test_appointments_api(self):
        """Test appointments endpoints"""
        # Test GET appointments
        success1, appointments = self.run_test("Get Appointments", "GET", "appointments", 200)
        
        # Test POST new appointment
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        test_appointment = {
            "client_name": "Test Client API",
            "client_email": "test@example.com",
            "client_phone": "0612345678",
            "service_type": "simple",
            "appointment_date": tomorrow,
            "appointment_time": "14:00",
            "location_type": "domicile",
            "address": "123 Test Street, Test City"
        }
        success2, created_appointment = self.run_test("Create Appointment", "POST", "appointments", 200, test_appointment)
        
        appointment_id = None
        if success2 and created_appointment:
            appointment_id = created_appointment.get('id')
            
            # Test GET specific appointment
            if appointment_id:
                success3, appointment = self.run_test("Get Specific Appointment", "GET", f"appointments/{appointment_id}", 200)
                
                # Test UPDATE appointment status
                success4, update_response = self.run_test("Update Appointment Status", "PUT", f"appointments/{appointment_id}/status", 200, None, {"status": "confirmed"})
                
                return success1 and success2 and success3 and success4, appointment_id
        
        return success1 and success2, appointment_id

    def test_time_slots_api(self):
        """Test time slots endpoints"""
        # Test GET available slots
        success1, slots = self.run_test("Get Available Slots", "GET", "available-slots", 200)
        
        # Test POST new slot
        tomorrow = (date.today() + timedelta(days=2)).isoformat()
        test_slot = {
            "date": tomorrow,
            "time": "15:00",
            "is_available": True
        }
        success2, created_slot = self.run_test("Create Time Slot", "POST", "available-slots", 200, test_slot)
        
        slot_id = None
        if success2 and created_slot:
            slot_id = created_slot.get('id')
            
            # Test UPDATE slot availability
            if slot_id:
                success3, update_response = self.run_test("Update Slot Availability", "PUT", f"available-slots/{slot_id}", 200, None, {"is_available": False})
                
                # Test DELETE slot
                success4, delete_response = self.run_test("Delete Time Slot", "DELETE", f"available-slots/{slot_id}", 200)
                
                return success1 and success2 and success3 and success4, slot_id
        
        return success1 and success2, slot_id

    def test_contact_api(self):
        """Test contact endpoints"""
        # Test POST contact message
        test_message = {
            "name": "Test User",
            "email": "test@example.com",
            "message": "Test message from API testing"
        }
        success1, created_message = self.run_test("Create Contact Message", "POST", "contact", 200, test_message)
        
        # Test GET contact messages
        success2, messages = self.run_test("Get Contact Messages", "GET", "contact", 200)
        
        return success1 and success2, created_message

    def test_instagram_api(self):
        """Test Instagram endpoints"""
        # Test GET auth URL
        success1, auth_url = self.run_test("Get Instagram Auth URL", "GET", "instagram/auth-url", 200)
        
        # Test GET posts (should fail without token)
        success2, posts = self.run_test("Get Instagram Posts (No Token)", "GET", "instagram/posts", 404)
        
        return success1 and success2, auth_url

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Hennaa.lash API Testing...")
        print(f"📍 Base URL: {self.base_url}")
        print("=" * 60)
        
        # Test basic connectivity
        self.test_root_endpoint()
        
        # Test core APIs
        self.test_services_api()
        self.test_reviews_api()
        self.test_client_login_api()
        appointment_id = self.test_appointments_api()[1]
        self.test_time_slots_api()
        self.test_contact_api()
        self.test_instagram_api()
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        print(f"Total tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        # Print failed tests
        failed_tests = [test for test in self.test_results if not test['success']]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"   • {test['name']}: {test['details']}")
        
        print("\n" + "=" * 60)
        
        return self.tests_passed == self.tests_run

def main():
    """Main test function"""
    tester = HennaLashAPITester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n\n💥 Unexpected error: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())