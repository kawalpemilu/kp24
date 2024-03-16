from flask import Flask, request
from google.appengine.api import wrap_wsgi_app
from google.appengine.ext import blobstore
from google.appengine.api.images import get_serving_url
from google.appengine.api import memcache
from google.appengine.api import urlfetch
import json
import random

app = Flask(__name__)
app.wsgi_app = wrap_wsgi_app(app.wsgi_app)

@app.route("/gsu")
def gsu():
    path = '/gs/{}'.format(request.args.get('path'))
    blob_key = blobstore.create_gs_key(path)
    return get_serving_url(blob_key)

def is_valid_id(id):
  return (not id) or (id.isdigit() and len(id) <= 13)

@app.route("/h")
def hierarchy():
    id = request.args.get('id')
    if not is_valid_id(id):
        return '{}'

    headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=36000000',
        'Access-Control-Allow-Origin': '*'
    }

    # Loads from memcache if exists.
    jsonTxt = memcache.get(id)
    if jsonTxt is not None:
        headers['X-Cache'] = 'HIT-M'
        return jsonTxt, 200, headers

    try:
        # Fetch fresh from the real API and set it to memcache.
        response = urlfetch.fetch(
            url='https://us-central1-kp24-fd486.cloudfunctions.net/h',
            method=urlfetch.POST,
            payload=json.dumps({"data": {"id": id, "uid": "gae"}}),
            headers={'Content-Type': 'application/json'})

        jsonTxt = response.content
        headers['X-Cache'] = 'HIT-D'
        # t = random.randint(12 * 60 * 60, 24 * 60 * 60) if len(id) >= 6 else 30 * 60 if len(id) >= 4 else 10 * 60 if len(id) >= 2 else 5 * 60
        memcache.set(id, jsonTxt)
        return jsonTxt, 200, headers

    except (urlfetch.Error, RuntimeError) as e:
        return '{}', 200, headers
