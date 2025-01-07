import jwt
import os
from datetime import datetime, timedelta

load_dotenv()
JWT_SECRET = os.getenv('JWT_SECRET')

def create_jwt(username, algorithm='HS256'):
  headers = {
    "alg": algorithm,
    "typ": "JWT"
  }
  payload = {
    "username": username,
    "exp": datetime.utcnow() + timedelta(days=1)
  }
  try:
    token = jwt.encode(payload, JWT_SECRET, algorithm, headers=headers)
    return token
  except Exception as e:
    return e
  
def decode_jwt(token, algorithm='HS256'):
  try:
    decoded = jwt.decode(token, JWT_SECRET, algorithm)
    return decoded
  except:
    return 'unauthorized'
  