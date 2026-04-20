# utils/response_utils.py
from flask import jsonify
from datetime import datetime

def success_response(msg, data=None, status=200):
    p = {"success":True,"message":msg,"timestamp":datetime.utcnow().isoformat()}
    if data is not None: p["data"] = data
    return jsonify(p), status

def error_response(msg, status=400):
    return jsonify({"success":False,"error":msg,"timestamp":datetime.utcnow().isoformat()}), status
