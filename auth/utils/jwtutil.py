import jwt
import os
from datetime import datetime, timedelta


def create_jwt(username, secret, algorithm='HS256'):
  headers = {
    "alg": algorithm,
    "typ": "JWT"
  }
  payload = {
    "username": username,
    "exp": datetime.utcnow() + timedelta(days=1)
  }
  try:
    token = jwt.encode(payload, secret, algorithm, headers=headers)
    return token
  except Exception as e:
    return e
  
def decode_jwt(token, secret, algorithm='HS256'):
  try:
    decoded = jwt.decode(token, secret, algorithm)
    return decoded
  except:
    return 'unauthorized'
  
print(decode_jwt('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InNoYWtlIiwiZXhwIjoxNzM2MzQ3MDI5fQ.Jr2jXt7Psvn3DBlrKuwtkXaaIKN8dGDzSb-d5q2fIlc', '^a2c4e6g8i0k1m3o5q7s9t#'))