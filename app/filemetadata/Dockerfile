FROM ubuntu:22.04

RUN apt-get update 
RUN apt-get install -y python3-pip python3-dev curl libcpprest libjsoncpp-dev libstdc++6 libcurl4
RUN cd /usr/local/bin && ln -s /usr/bin/python3 python && pip3 install --upgrade pip

# Prepare App folder 
RUN mkdir -p /app
WORKDIR /app

# Install node js packages
ADD ./app/package.json /app/
ADD ./app/package-lock.json /app/
ENV NODE_VERSION 18.17.0

RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.39.3/install.sh | bash
ENV NVM_DIR=/root/.nvm
RUN . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"

RUN npm install --unsafe-perm

# Install python requirements 
ADD pip.conf /etc
ADD ./app/requirements.txt /app/
RUN pip install -r requirements.txt

# OpenZgy Bundle packages available on https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/open-zgy/-/packages
# Current version OpenZGY.jammy.sdms-bundle-azure-curl.0.2.1009.tar.gz - OpenZGY version 0.2.1009
ARG OPENZGY_BUNDLE_URL="https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/open-zgy/-/package_files/3149277/download"

#Get openzgy bundle
RUN mkdir -p /app/openzgy-bundle
WORKDIR /app/openzgy-bundle
RUN curl ${OPENZGY_BUNDLE_URL} -o /app/openzgy-bundle/openzgy.bundle.tar.gz
RUN tar zxvf openzgy.bundle.tar.gz
WORKDIR /app/openzgy-bundle/wrapper
WORKDIR /app/openzgy-bundle/wrapper/jammy-gcc112
RUN pip install *.whl
WORKDIR /app

# Let the app copy to the end and avoid rebuilding many layers when source code change
COPY ./app .

EXPOSE 8000

CMD [ "python", "./main.py"]
