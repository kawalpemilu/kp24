import json

from flask import Flask, request
from google.appengine.api import wrap_wsgi_app
from google.appengine.ext import blobstore
from google.appengine.api import memcache
from google.appengine.api import urlfetch
from google.appengine.api.images import get_serving_url

app = Flask(__name__)
app.wsgi_app = wrap_wsgi_app(app.wsgi_app)

@app.route("/gsu")
def gsu():
    path = '/gs/{}'.format(request.args.get('path'))
    blob_key = blobstore.create_gs_key(path)
    return get_serving_url(blob_key)

@app.route("/c/<cid>")
def get(self, cid):
    self.response.headers['Content-Type'] = 'application/json'
    self.response.headers['Cache-Control'] = 'max-age=3600'
    self.response.headers['Access-Control-Allow-Origin'] = '*'

    # Loads from memcache if exists.
    jsonTxt = memcache.get(cid)
    if jsonTxt is not None:
        h = json.loads(jsonTxt)
        if 'depth' in h and 'data' in h and len(h['data'].keys()) > 0:
            self.response.headers['X-Cache'] = 'HIT-M'
            return self.response.out.write(jsonTxt)

    try:
        # Fetch fresh from the real API and set it to memcache.
        url = 'https://???' + cid + '?abracadabra=1'
        jsonTxt = urlfetch.fetch(url).content
        self.response.headers['X-Cache'] = 'HIT-D'
        self.response.out.write(jsonTxt)

        h = json.loads(jsonTxt)
        if 'depth' in h:
            memcache.set(cid, jsonTxt)
    except urlfetch.Error:
        self.response.out.write('{}')
        memcache.set(cid, '{}', 3600)
        app.logger.error('Failed fetching ' + url)
