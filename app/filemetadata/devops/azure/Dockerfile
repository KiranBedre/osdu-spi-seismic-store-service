FROM mcr.microsoft.com/mirror/docker/library/ubuntu:22.04

RUN apt-get update \
    && apt-get install -y python3-pip python3-dev curl \
    && cd /usr/local/bin \
    && ln -s /usr/bin/python3 python \
    && pip3 install --upgrade pip

ADD pip.conf /etc

COPY ./app /app

WORKDIR /app

RUN pip install -r requirements.txt

# Install node js
ENV NODE_VERSION 18.17.0

RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.39.3/install.sh | bash
ENV NVM_DIR=/root/.nvm
RUN . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"

RUN npm install --unsafe-perm

EXPOSE 8000
CMD [ "python", "./main.py"]
