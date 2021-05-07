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
The list of routes is grouped by access rights. In order to access some routes, you need to authenticate your request with a JWT containing a `sub` claim with the respective value (`exhibition`, `generator` or `admin`):

* (no auth needed)
	* [GET /](#get-)
	* [GET /svg](#get-svg)
	* [GET /token](#get-token)
	* [GET /tokens](#get-tokens)
* `exhibition`
	* [GET /request_interaction](#get-request_interaction)
	* [GET /deposit_interaction](#get-deposit_interaction)
	* [GET /interaction_updates](#get-interaction_updates)
* `generator`
	* [GET /new_interaction_updates](#get-new_interaction_updates)
	* [GET /update_interaction](#get-update_interaction)
	* [PUT /token](#put-token)
* `admin`
	* [DELETE /token](#delete-token)
	* [DELETE /tokens](#delete-tokens)


### **GET /**
Get API information.

Query parameters:
* None

Returns:
* 200 `{ name, description, version, git_sha }`

Errors:
* None


### **GET /svg**
Retrieve SVG representation of a single token. Can be used to provide direct-download links.

Query parameters:
* `id`: The token id.
* `download`: Optional. When present (can be set to empty string) triggers a direct download of the SVG.

Returns:
* SVG text of the token. Response has content-type `image/svg+xml`.
* If `download` is used, response has content-type `application/octet-stream` and content-disposition `attachment; filename="token-<id>.svg"` which usually triggers a direct download in the browser.

Errors:
* 400 `{error: 'id missing'}`
* 404 `{error: 'token not found'}`


### **GET /token**
Retrieve a single token.

Query parameters:
* `id`: Token id

Returns:
* `{ id, svg, generated, keywords }`
	* `id`: Token id.
	* `svg`: SVG of the token.
	* `generated`: ISO timestamp.
	* `keywords`: Array of keywords used to generate the token.

Errors:
* 400 `{error: 'id missing'}`
* 404 `{error: 'token not found'}`


### **GET /tokens**
Retrieve a range tokens. One of the parameters `offset`, `start_id` or `end_id` is required. When `offset` is set `start_id` and `end_id` are ignored; when `start_id` is set `end_id` is ignored.

Use `offset` to jump to a specific position within the database. By default, the newest token is at offset 0 (`newest_first=true`). For example get the first page of newest tokens with `offset=0&count=100`. To get tokens from the end of the database use a negative `offset` e.g. `offset=-100&count=100` gets the 100 tokens at the end.

Use `start_id` to efficiently get the next page of tokens after an initial request with `offset`, which returns the id of the next page in the `next` field. Similarly, use `end_id` to efficiently get the previous page of tokens, together with the `prev` field returned by the initial request.

Query parameters:
* `offset`: Offset in the database to retrieve tokens from. Negative offsets count from the end of the database, i.e. -1 is the last token, -2 the second to last etc. (default: `0`).
* `start_id`: Retrieve `count` tokens, beginning with this id. (default: ignored)
* `end_id`: Retrieve `count` tokens, ending with this id, inclusive. (default: ignored)
* `count`: Number of tokens to retrieve. (default: `1`).
* `newest_first`: Sort order of the database. (default: `true`).

Returns:
* `{ rows, total_rows, offset, next, prev }`
	* `rows`: Array of tokens. See [GET /token](#get-token) for individual token fields.
	* `total_rows`: Total number of tokens in the database.
	* `offset`: Offset of the first result in `rows` from the beginning of the database.
	* `next`: Id of next token. Can be used with `start_id` on a subsequent request to get the next page. Is `null` in case we're at the end already.
	* `prev`: Id of previous token. Can be used with `end_id` on a subsequent request to get the previous page. Is `null` in case we're at the beginning.

Errors:
* 400 `{error: 'need offset, start_id or end_id'}`
* 400 `{error: 'count out of range'}`
* 400 `{error: 'offset out of range'}`


### **GET /request_interaction**
Request to interact with the Tokens Live Installation. The request can be denied with error 423 if the interaction queue is full. If the request is successful, an interaction id and a color are returned.

Query parameters:
* None

Returns:
* `{ id, color }`
	* `id`: Interaction id. Used with [GET /deposit_interaction](#get-deposit_interaction) to send user- selected keywords to the installation.
	* `color`: RGB hex color code, e.g. `#70c5ff`. Used to color the interaction interface. The generated token in the live installation will have the same color.

Errors:
* 423 `{error: 'queue limit reached'}`


### **GET /deposit_interaction**
Send a user interaction to the installation. After this request completed sucessfully (with status 200), [GET /interaction_updates](#get-interaction_updates) can be used to provide feedback about the state of the interaction to the user.

Query parameters:
* `id`: Interaction id retrieved by [GET /request_interaction](#get-request_interaction)
* `keywords`: Comma-separated string of exactly three keywords the user has selected e.g. `sustainable,future,contract`.

Returns:
* No return value

Errors:
* 400 `{error: 'id missing'}`
* 400 `{error: 'keywords missing'}`
* 400 `{error: 'exactly three keywords needed'}`
* 404 `{error: 'not found'}`


### **GET /interaction_updates**
Receive updates about an interaction. Provides the position in queue, and, once the token based on the user input was generated the token id.

Use long-polling to continually supply information to the user:
* Initially omit the `since` parameter. The request will hang until the first update is received or the timeout is reached.
* In general, if a timeout (Error 504) or other network error occurs, immediately start another request with the same parameters to continue listening for updates.
* If the request is successful (status 200)...
	* ... and `queue_position > 0`, update the UI, and immediately start another request, setting the `since` parameter to the returned update sequence number `seq`.
	* ... and `queue_position = 0`, the token was generated and the installation starts to display it for some time. Update the UI with the newly generated token by using the supplied `token_id`.

Query parameters:
* `id`: Interaction id
* `since`: (default: ignored)
* `timeout`: (default: `60000`)

Returns:
* `{ id, seq, queue_position, token_id }`
	* `id`: The interaction id
	* `seq`: Update sequence number. Use with the `since` parameter in a subsequent request to get the next update.
	* `queue_position`: Position in the interaction queue i.e. the number of people before you. If `0` your token was sucessfully generated and is starting to be displayed by the installation. In this case, `token_id` will contain the a valid token id.
	* `token_id`: If `queue_position` 0 is reached, contains the token id, otherwise `null`.

Errors:
* 504 Timeout reached
* 400 `{error: 'id missing'}`
* 404 `{error: 'not found'}`


### **GET /new_interaction_updates**
Allows the token generator (installation) to listen for incoming interactions. Use with long polling.

Query parameters:
* `since`: (default: ignored)
* `timeout`: (default: `60000`)

Returns:
* `{ id, seq, color, keywords }`
	* `id`: The interaction id
	* `seq`: Update sequence number. Use with the `since` parameter in a subsequent request to get the next update.
	* `color`: RGB hex color code, e.g. `#70c5ff`
	* `keywords`: Array of three strings

Errors:
* 504 Timeout reached


### **GET /update_interaction**
Allows the installation to notify queuing interactions about their queue position or, eventually, the generated token id. One of `queue_position` or `token_id` is required.

Query parameters:
* `id`: The interaction id
* `queue_position`: Integer >= 0. Can be omitted if `token_id` is given.
* `token_id`: Optional. If present, `queue_position` will be set to 0.

Returns:
* No return value

Errors:
* 400 `{error: 'id missing'}`
* 400 `{error: 'queue_position or token_id required'}`
* 400 `{error: 'invalid queue_position'}`, if `queue_position` < 0
* 404 `{error: 'interaction not found'}`
* 404 `{error: 'token not found'}`, if `token_id` was provided, but invalid


### **PUT /token**
Allows the installation to archive newly generated tokens.

Query parameters:
* None

Request body:
* `{ svg, generated, keywords }`
	* `svg`: SVG of the token.
	* `generated`: ISO timestamp.
	* `keywords`: Array of (three) keywords used to generate the token.

Returns:
* `{ id }`
	* `id`: Token id.

Errors:
* 400 `{error: 'required attribute(s) missing'}`, if one or more of the required attributes are missing in the request body JSON object.


### **DELETE /token**


### **DELETE /tokens**

