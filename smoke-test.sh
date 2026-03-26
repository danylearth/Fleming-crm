#!/bin/bash

# Fleming CRM Smoke Test Script
# Tests critical CRUD operations before deployment
# Usage: ./smoke-test.sh <API_URL> <ADMIN_EMAIL> <ADMIN_PASSWORD>

set -e  # Exit on any error

API_URL=${1:-"http://localhost:3001"}
ADMIN_EMAIL=${2:-"admin@fleming.com"}
ADMIN_PASSWORD=${3:-"admin123"}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "Fleming CRM Smoke Test"
echo "API: $API_URL"
echo "======================================"
echo ""

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to run test
run_test() {
    local test_name="$1"
    local test_command="$2"

    ((TESTS_RUN++))
    echo -n "Testing: $test_name... "

    if eval "$test_command" > /tmp/smoke_test_output 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((TESTS_FAILED++))
        cat /tmp/smoke_test_output
        return 1
    fi
}

# Test 1: Health Check
run_test "Health Check" \
    "curl -sf $API_URL/api/health | grep -q 'ok'"

# Test 2: Login and get token
echo -n "Logging in... "
TOKEN=$(curl -sf -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_RUN++))
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL (Could not get auth token)${NC}"
    ((TESTS_RUN++))
    ((TESTS_FAILED++))
    exit 1
fi

# Test 3: Create Landlord
run_test "Create Landlord" \
    "LANDLORD_ID=\$(curl -sf -X POST '$API_URL/api/landlords' \
        -H 'Authorization: Bearer $TOKEN' \
        -H 'Content-Type: application/json' \
        -d '{\"name\":\"Smoke Test Landlord\",\"email\":\"smoke@test.com\",\"phone\":\"07700900000\",\"landlord_type\":\"external\"}' \
        | grep -o '\"id\":[0-9]*' | cut -d':' -f2) && [ -n \"\$LANDLORD_ID\" ]"

# Get the landlord ID for property creation
LANDLORD_ID=$(curl -sf -X POST "$API_URL/api/landlords" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Property Test Landlord","email":"proptest@test.com","phone":"07700900001","landlord_type":"external"}' \
    | grep -o '"id":[0-9]*' | cut -d':' -f2)

# Test 4: Create Property
run_test "Create Property" \
    "PROPERTY_ID=\$(curl -sf -X POST '$API_URL/api/properties' \
        -H 'Authorization: Bearer $TOKEN' \
        -H 'Content-Type: application/json' \
        -d '{\"landlord_id\":$LANDLORD_ID,\"address\":\"123 Smoke Test St\",\"postcode\":\"SM1 1ST\",\"bedrooms\":3,\"rent_amount\":1200,\"has_gas\":true}' \
        | grep -o '\"id\":[0-9]*' | cut -d':' -f2) && [ -n \"\$PROPERTY_ID\" ]"

# Get the property ID for updates
PROPERTY_ID=$(curl -sf -X POST "$API_URL/api/properties" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"landlord_id\":$LANDLORD_ID,\"address\":\"456 Update Test Ave\",\"postcode\":\"UP1 2TE\",\"bedrooms\":2,\"rent_amount\":1000,\"has_gas\":false}" \
    | grep -o '"id":[0-9]*' | cut -d':' -f2)

# Test 5: Update Property
run_test "Update Property" \
    "curl -sf -X PUT '$API_URL/api/properties/$PROPERTY_ID' \
        -H 'Authorization: Bearer $TOKEN' \
        -H 'Content-Type: application/json' \
        -d '{\"rent_amount\":1100,\"amenities\":\"Garden, Parking\"}' \
        | grep -q 'rent_amount'"

# Test 6: Create Tenant Enquiry
run_test "Create Tenant Enquiry" \
    "curl -sf -X POST '$API_URL/api/public/tenant-enquiries' \
        -H 'Content-Type: application/json' \
        -d '{\"first_name_1\":\"Smoke\",\"last_name_1\":\"Test\",\"email_1\":\"smoketest@example.com\",\"phone_1\":\"07700900002\"}' \
        | grep -q 'id'"

# Test 7: Create Task
run_test "Create Task" \
    "curl -sf -X POST '$API_URL/api/tasks' \
        -H 'Authorization: Bearer $TOKEN' \
        -H 'Content-Type: application/json' \
        -d '{\"title\":\"Smoke Test Task\",\"description\":\"Test task\",\"entity_type\":\"property\",\"entity_id\":$PROPERTY_ID,\"priority\":\"medium\",\"task_type\":\"manual\"}' \
        | grep -q 'id'"

# Test 8: Get Properties List
run_test "List Properties" \
    "curl -sf -X GET '$API_URL/api/properties' \
        -H 'Authorization: Bearer $TOKEN' \
        | grep -q '\['"

# Test 9: Get Landlords List
run_test "List Landlords" \
    "curl -sf -X GET '$API_URL/api/landlords' \
        -H 'Authorization: Bearer $TOKEN' \
        | grep -q '\['"

# Test 10: Get Property Detail
run_test "Get Property Detail" \
    "curl -sf -X GET '$API_URL/api/properties/$PROPERTY_ID' \
        -H 'Authorization: Bearer $TOKEN' \
        | grep -q 'address'"

echo ""
echo "======================================"
echo "Test Summary"
echo "======================================"
echo "Tests Run:    $TESTS_RUN"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
    echo "Safe to deploy!"
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo "DO NOT DEPLOY until failures are fixed!"
    exit 1
fi
