import requests

try:
    # Register
    reg_url = "http://localhost:8000/api/v1/auth/register"
    reg_data = {
        "username": "admin",
        "email": "admin@example.com",
        "password": "adminpassword",
        "role": "operator"
    }
    r = requests.post(reg_url, json=reg_data)
    print("Registration response:", r.status_code, r.text)
except Exception as e:
    print("Registration error/already exists:", e)

# Login
login_url = "http://localhost:8000/api/v1/auth/login"
login_data = {
    "username": "admin",
    "password": "adminpassword"
}
try:
    r = requests.post(login_url, data=login_data)
    print("Login response:", r.status_code)
    if r.status_code == 200:
        token = r.json().get("access_token")
        print("TOKEN:", token)
except Exception as e:
    print("Login error:", e)
