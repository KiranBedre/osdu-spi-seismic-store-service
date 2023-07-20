# SEISMIC STORE

Seismic Store is a cloud-based solution designed to store and manage datasets of any size in the cloud by enabling a secure way to access them through a scoped authorization mechanism. Seismic Store overcomes the object size limitations imposed by a cloud provider, by managing generic datasets as multi independent objects and, therefore, provides a generic, reliable and a better performed solution to handle data on a cloud storage.

Saving a dataset on a cloud-based storage, as single entity, may be a problem when it exceeds the maximum allowed object size. Adopting a single object storage approach is also not an optimal solution in terms of performance as a single entity cannot be easily uploaded and downloaded directly in parallel.

Seismic Store is a cloud-based solution composed by restful micro-services, client APIs and tools designed to implement a multi-object storage approach. The system saves objects that compose a dataset as a hierarchical data structure in a cloud storage and the dataset properties as a metadata entry in a no-relational catalogue. Having the datasets stored as multiple independent objects improve the overall performance, as generic I/O operations, for example read or write objects, can be easily parallelized.

Seismic Store manages data authorization at service level by protecting access to storage bucket resources. Only service authorized users are enabled to directly access a storage resource. The service implements a mechanism that generates an “impersonation token” by authorizing long running/background production jobs to access data without requiring further user interactions.

Seismic DMS is a software suite solution compose by multiple micro services:

1. [seismic store service V3](app/sdms/README.md): a DMS designed to store and manage datasets on the cloud.
2. [seismic store service V4](app/sdms-v4/README.md): a DMS designed to store and manage seismic domain data on the cloud.
3. [filemetadata](app/filemetadata/README.md): a microservice designed to compute, retrieve and manage seismic header data.
