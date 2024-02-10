FROM node:lts-slim
ARG BUILD_DATE
ARG VERSION
ENV FIREBASE_TOOLS_VERSION=${VERSION}
ENV HOME=/home/node
EXPOSE 4000
EXPOSE 5000
EXPOSE 5001
EXPOSE 8080
EXPOSE 8085
EXPOSE 9000
EXPOSE 9005
EXPOSE 9099
EXPOSE 9199
SHELL ["/bin/bash", "-c"]
RUN apt-get update && apt-get install -y autoconf g++ libtool make openjdk-17-jre-headless python3 && \
    npm install -g firebase-tools@${VERSION} typescript && \
    npm cache clean --force && \
    firebase setup:emulators:database && \
    firebase setup:emulators:firestore && \
    firebase setup:emulators:pubsub && \
    firebase setup:emulators:storage && \
    firebase -V && \
    java -version && \
    chown -R node:node $HOME
USER node
VOLUME $HOME/.cache
WORKDIR $HOME
CMD ["bash"]
