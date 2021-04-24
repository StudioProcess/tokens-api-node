# Tokens for Climate Care – Web API

## General
The base URL of the API is `https://api.tokensforclimate.care`.\
If not otherwise noted, all responses have content type `application/json`.

## Authentication
Almost all request need to be authenticated with a JWT (JSON Web Token).
To authenticate your request send the following header:
`Authentication: Bearer <your_jwt>`\
\
[API Tokens for Website Development](https://docs.google.com/document/d/1MbskWrvnuXs7MY0vrCY-mmzKt8ZyZT8loqiIhbXc1t0/edit?usp=sharing)\
[API Tokens for Admin](https://docs.google.com/document/d/1RiKbJow4UGLtR3EXqYY-szedcUF8EhPXnct8MKbYS5w/edit?usp=sharing)

## Routes
These routes are grouped by access rights. In order to access a route, you need to authenticate your request with a JWT containing a `sub` claim with the given value.

* (no auth needed)
	* [GET /](#get-)
	* [GET /svg](#get-svg)
* `public`
	* [GET /token](#get-token)
	* [GET /tokens](#get-tokens)
* `exhibition`
	* [GET /request_interaction](#get-request_interaction)
	* [GET /deposit_interaction](#get-deposit_interaction)
	* [GET /interaction_updates](#get-interaction_updates)
* `generator`
	* [PUT /token](#put-token)
	* [GET /new_interaction_updates](#get-new_interaction_updates)
	* [GET /update_interaction](#get-update_interaction)
* `admin`
	* [DELETE /token](#delete-token)
	* [DELETE /tokens](#delete-tokens)

### **GET /**
query parameters:\
none

returns:\
`{ name, description, version, git_sha}`

errors:\
none

### **GET /svg**
query parameters:
* id: token id

returns:\
content-type: image/svg+xml

errors:
* 400 `{error: 'id missing'}`
* 404 `{error: 'token not found'}`

### **GET /token**
query parameters:
* id: token id

returns:\
`{ id, svg, generated, keywords }`

errors:
* 400 `{error: 'id missing'}`
* 404 `{error: 'token not found'}`

### **GET /tokens**
query parameters:
* offset:
* start_id:
* end_id:
* count:
* newest_first:

returns:\
`{ rows: [], total_rows, next, prev }`

errors:
* 400 `{error: 'need offset, start_id or end_id'}`
* 400 `{error: 'count out of range'}`
* 400 `{error: 'offset out of range'}`

### **GET /request_interaction**
query parameters:\
none

returns:\
`{ id, color }`

errors:
* 423 `{error: 'queue limit reached'}`

### **GET /deposit_interaction**
query parameters:
* id
* keywords

returns:\
no return value

errors:
* 400 `{error: 'id missing'}`
* 400 `{error: 'keywords missing'}`
* 400 `{error: 'exactly three keywords needed'}`
* 404 `{error: 'not found'}`

### **GET /interaction_updates**
query parameters:
* id
* timeout

returns:\
`{ id, queue_position, token_id }`

errors:
* 504 Timeout
* 400 `{error: 'id missing'}`
* 404 `{error: 'not found'}`

### **PUT /token**
### **GET /new_interaction_updates**
### **GET /update_interaction**
### **DELETE /token**
### **DELETE /tokens**
