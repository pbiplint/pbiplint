---
id: HARDCODED_SECRET_IN_QUERY
name: "Secret written into a query"
category: Error Prevention
severity: error
scope: [Partition, NamedExpression, Table]
status: builtin
layer: powerquery
video:
sources:
---

# Secret written into a query

## What it checks

Credentials written into Power Query queries as text: a key, token, or password in a web request's headers or `Query` record, in a web address, as a Bearer token, or in an ODBC or OLE DB connection string.

Each finding names the partition, the shared expression, or, for an incremental refresh policy's own query, the table, and says where the credential is, never what it is: `query 'Orders API', step 'Source': the Authorization header in Web.Contents holds a credential written into the query (value not shown)`. No output of pbiplint shows any part of the value, its length, or anything computed from it. The location is the line and column where the text starts in the TMDL file, so you can find it in your own copy. When a parameter or a step holds the credential, the finding is on that text, once, however many queries read it.

## Example

```tmdl fires
table 'Orders API'
	column Content
		dataType: binary
		summarizeBy: none
		sourceColumn: Content

	partition 'Orders API' = m
		mode: import
		source =
				let
					Source = Web.Contents("https://api.example.com/v1/orders", [Headers = [Authorization = "Bearer pbiplint-fixture-example-0909-notreal"]])
				in
					Source
```

```tmdl fixed
table 'Orders API'
	column Content
		dataType: binary
		summarizeBy: none
		sourceColumn: Content

	partition 'Orders API' = m
		mode: import
		source =
				let
					Source = Web.Contents("https://api.example.com/v1/orders")
				in
					Source
```

## Why it matters

A Power BI project is text made for source control: every copy of the repository, every clone, and every fork holds the queries as written, and so holds the credential. Removing the line later does not take it back, since the history keeps it. Microsoft's reference for `Web.Contents` names the risk while showing the alternative: "Instead of hard-coding the secret key in M (which would pose a security risk), the key can be provided securely by specifying its name (not its value) in M, choosing Web API authentication, and entering the key value as part of the Web API credential." ([Web.Contents, Example 3](https://learn.microsoft.com/powerquery-m/web-contents#example-3)).

## How to fix it

1. Revoke or rotate the credential with whoever issued it, first. The old value is in the repository's history, so taking it out of the query does not unpublish it.
2. In Power BI Desktop, choose Transform data, select the query, and select the step the finding names in Applied steps. Delete the credential from the step's address, header, or `Query` record in the formula bar, or from the parameter that holds it (Home, Manage Parameters). In the TMDL file, the text is in the partition's `source` block, or in the expression's value for a parameter.
3. For a model that is published, give the source a credential the service can refresh with. Where the source accepts it, sign in with an organizational account: when Desktop asks for credentials, choose Organizational account, one of the authentication kinds the Web connector lists for `Web.Contents` ([Web connector, Summary](https://learn.microsoft.com/power-query/connectors/web/web#summary)). Where the source takes only a key, Microsoft's route is a custom connector that holds the credential: "If you build reports in Power BI Desktop that use custom data connectors, you can use an on-premises data gateway to refresh those reports in the Power BI service." ([Use custom data connectors with the on-premises data gateway](https://learn.microsoft.com/power-bi/connect-data/service-gateway-custom-connectors)).
4. For a model that is never published, `ApiKeyName` with a Web API credential keeps the key out of the files, as Example 3 above shows. Do not rely on it for a published model: "The Web API authentication type is available in Power BI Desktop and Power Query in Excel, but isn't supported in the Power BI service." ([Web connector, Summary](https://learn.microsoft.com/power-query/connectors/web/web#summary)).

## When to ignore it

When the text is not a working credential, such as a public demo key the provider publishes for everyone, or a value already revoked. Even then, a placeholder that reads as one, such as `<your key>`, says so to the next reader without looking like a leak.

## Quirks

- Read as a credential: the value of an `Authorization`, `x-api-key`, `api-key`, `apikey`, `Ocp-Apim-Subscription-Key`, `x-auth-token`, or `x-functions-key` header in `Web.Contents` or `OData.Feed`; a field of their `Query` record named `api_key`, `apikey`, `key`, `access_token`, `token`, `client_secret`, `secret`, `password`, `code`, or `subscription-key`; a web address's parameter with one of those names, or `sig` or `signature`; text that starts `Bearer ` followed by at least 16 token characters, anywhere; and `Password=` or `Pwd=` in the connection string of `Odbc.DataSource`, `Odbc.Query`, `OleDb.DataSource`, or `OleDb.Query`. Names are read in any case.
- A header or field whose value is a name is followed to the step or parameter that holds the text. A value joined with `&` is read as its texts joined, and each name in it is followed the same way.
- Text under 8 characters once a scheme word such as `Bearer ` is left off, text with a space left in it, such as `Enter your key here`, and placeholders (text in angle brackets or braces, such as `<your key>`; text starting with three x's or three asterisks; text starting `your`; and `placeholder`, `null`, `none`, `test`, and `demo`) are not read as credentials.
- `ApiKeyName`, which names the key rather than holding it, is left alone, and so is anything in a comment.
- A connection string written as a record, rather than as text, is not read.
- A connection string or a web address built with `&` is not followed, so a password or a key joined into it from a step or a parameter, as in `Odbc.DataSource("dsn=Sales;Pwd=" & Password)`, is not read.
- A query whose M does not parse is not read, and its `PARSE_ISSUE` finding quotes the line where the parser stopped, which may hold the credential.

## Related rules

- `ODBC_WHERE_CONNECTOR_EXISTS` reads the same connection strings for the driver they name.
- `DYNAMIC_DATA_SOURCE` reads the same `Web.Contents` calls for their address; moving a key into the `Query` record keeps the address static but still writes the key into the query.

## Links

- [Web.Contents](https://learn.microsoft.com/powerquery-m/web-contents)
- [Power Query Web connector](https://learn.microsoft.com/power-query/connectors/web/web)
