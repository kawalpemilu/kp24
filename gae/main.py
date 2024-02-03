from flask import Flask, request
from google.appengine.api import wrap_wsgi_app
from google.appengine.ext import blobstore
from google.appengine.api.images import get_serving_url

app = Flask(__name__)
app.wsgi_app = wrap_wsgi_app(app.wsgi_app)

@app.route("/gsu")
def gsu():
    path = '/gs/{}'.format(request.args.get('path'))
    blob_key = blobstore.create_gs_key(path)
    return get_serving_url(blob_key)
