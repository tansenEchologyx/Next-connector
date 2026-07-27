# Next Label Plus Integration

**Status:** Released

**Prepared for:** Chinti & Parker Ltd

| | |
|---|---|
| **Author** | KornitX |
| **Date** | 2026-6-29 |
| **Project Ref** | NXT - Chinti & Parker Ltd |

## Document Information

| Field | Value |
|---|---|
| Document Reference | Chinti & Parker Ltd API Non-stocked supplier integration 1.0.docx |
| Last Modified Date | 2026-6-29 |
| Current Document Status | Released |

## Revision History

| Version | Date | Revision Details |
|---|---|---|
| 1 | 2026-6-29 | Initial version |

## Document Approval

| Date | Reviewer | Signature |
|---|---|---|
| 2026-6-29 | RA | On File |

---

## Table of Contents

1. [Introduction](#introduction)
2. [REST API integration options](#rest-api-integration-options)
3. [Data exchange over REST API](#data-exchange-over-rest-api)
   - [Order API](#order-api)
   - [Stock API](#stock-api)
   - [Shipping API](#shipping-api)

---

## Introduction

This document describes the integration specification for Chinti & Parker Ltd to integrate to the Next Non-Stocked Platform for Label Plus.

Details are supplied for order and stock management using RESTful JSON APIs.

---

## REST API integration options

For order management, KornitX can integrate with supplier systems in order to send Label Plus orders. The following order API requirements sections describe the core requirements for order management from a Supplier API.

KornitX has a REST API available for stock management and order status updates. Details of these are also included in the sections below.

### Requirements and specifications

The following specifies the requirements for the Next non-stocked integration handling inbound orders, using REST APIs and for outbound stock management data, using the KornitX REST API endpoint.

---

## Data exchange over REST API

### Order API

Should you wish to engage in use of an API for inbound order processing, you will be required to allow KornitX to push orders from Next, via the Label Plus integration.

KornitX receives orders from Next for suppliers every hour between 0000 and 1800 and every 30 minutes between 1800 and 0000 each day, ensuring that peak hours are processed more quickly.

The API may either allow orders to be sent upon receipt from Next in the KornitX OMS system to your system, or they may be batched on a time-frequency basis and sent at agreed intervals. The minimum number of batches sent a day is 4 (every six hours) to mitigate potential risks of data transfer failures.

#### Authentication

Next prefer that the API uses OAuth2 to handle API authentication in order to ensure security of order data shared. However, this is not imperative as the data exchanged does not include customer-specific details. Options for API Authentication methods supported as standard are:

- Basic HTTP (username / password)
- OAuth2

Authentication options must be agreed in advance with KornitX and we will require your authentication specification in good time prior to the agreed timescale for testing. Any authentication options other than those listed above may require custom development.

#### API Requirements

It is preferred that the API be RESTful with a JSON data format. The API must allow KornitX to POST orders from the OMS platform to your platform via API.

#### Success, error and exception handling

Next requires that the API is built to provide success and failure responses to indicate when an order has been successfully accepted or if there has been an exception and the request has failed. In the event of a failure, it is required that the exception is logged, for trouble-shooting purposes and that a reason description is issued with the failure.

In the event that an order is accepted, your API should issue a success state, which will be handled as an order acknowledgement by the KornitX OMS platform.

In the event that an order cannot be fulfilled or accepted, due to data issues or any other reasons, the API is required to provide a REST failure response with a reason code. The KornitX platform may then re-try the order up to five times, depending on the reason code.

#### Errors

When the API encounters an error, it will return either a 400 or 500 HTTP status code along with a JSON encoded error response.

| Code | Meaning | Solution |
|---|---|---|
| 0 | — | Please check error message for details |
| 100 | Invalid JSON | Please check the error message for details on syntax errors etc |
| 401 | Unauthorised transaction request | Please contact support |
| 50000 | Either your RefID or your API key are incorrect | Please make sure your details are correct |
| 50001 | Company type error | Please contact support |

#### Standard Order API Data

Data provided in the KornitX order post will be as follows:

| Name | Format | Mandatory | Notes |
|---|---|---|---|
| Brand | String | Y | For Chinti & Parker Ltd, this will be Chinti & Parker Ltd |
| ID | Integer | Y | Unique KornitX generated order or batch ID – (8 characters) |
| EAN | String | Y | EAN is mandatory and is used as the primary identifier for items, should match barcode on physical item |
| ItemID | Integer | Y | Unique KornitX generated Item ID – (9 characters) |
| Currency | String | Y | GBP only |
| Quantity | Integer | Y | Order quantities on this model will always be 1 within the order files |
| PromiseDate | String / YYYY-MM-DD | Y | Delivery date given to the customer at point of order |
| OrderExternalRef | String | Y | Reference to differentiate between live customer and pre-emptive orders. Next team will confirm the 2-letter prefix that indicate pre-emptive orders once available. |
| Destination | String | Y | Stationary field, will always be "NextRDC". The designated RSC for order collection will be confirmed by the Next team |
| DateTimeStamp | String / YYYY-MM-DDTHH:MM:SS+00:00 (ISO8601) | Y | Date and time of file creation |

#### Standard Order API Formats

Any order file formats other than the one provided below will require custom development.

**Single item order** — sample data structure our platform sends:

```json
{
  "Orders": [
    {
      "ID": 12223344,
      "Brand": "Chinti & Parker Ltd",
      "Destination": "NextRDC",
      "DateTimeStamp": "2026-6-29T10:43:7",
      "Currency": "GBP",
      "Items": [
        {
          "ItemID": 123456789,
          "EAN": "1234567890123",
          "Quantity": 1,
          "PromiseDate": "2026-06-31"
        }
      ],
      "OrderExternalRef": "AB1234567812345"
    }
  ]
}
```

**Batched orders** — sample data structure for an Order API where orders have been batched:

```json
{
  "Orders": [
    {
      "ID": 10000000,
      "Brand": "Chinti & Parker Ltd",
      "Destination": "NextRDC",
      "DateTimeStamp": "2026-6-29T10:43:7",
      "Currency": "GBP",
      "Items": [
        {
          "ItemID": 123456781,
          "EAN": "1234567890123",
          "Quantity": 1,
          "PromiseDate": "2026-06-31",
          "OrderExternalRef": "AB1234567812345"
        },
        {
          "ItemID": 123456782,
          "EAN": "1234567890123",
          "Quantity": 1,
          "PromiseDate": "2026-06-31",
          "OrderExternalRef": "AB1234567812346"
        },
        {
          "ItemID": 123456783,
          "EAN": "1234567890143",
          "Quantity": 1,
          "PromiseDate": "2026-06-31",
          "OrderExternalRef": "AB1234567812347"
        }
      ]
    }
  ]
}
```

---

### Stock API

KornitX provides a Stock API to allow you to provide up-to-date stock information when stock positions change on products being offered on the Next platform.

One stock file (full feed) should be sent daily. There is a requirement based on stock type (ring-fenced or shared stock pool) for further delta files, containing absolute values, at agreed intervals. Timings will be agreed with the Next team. The recommended delta file frequency in case of a shared stock pool is every 20-30 minutes.

Delta files should be limited to 100 EANs per file for quicker processing times. There is no limit on the number of delta files sent in a certain period of time.

The stock API allows you to provide stock updates, based on the product EAN, using a RESTful API.

**Stock API:**

```bash
curl -X PUT -d '[
  { "barcode": "5555555555555", "data": { "quantity_available": 10 } },
  { "barcode": "5555555555556", "data": { "quantity_available": 0 } }
]' \
-H "Authorization: Basic REFID:<KEY>" \
-H "Content-type: application/json" \
https://api-sl-2-2.custom-gateway.net/stock/availability
```

`REFID` is the KornitX account code and `<KEY>` is the API Key, to be confirmed with authentication details.

A stock quantity of 0 should be sent if Chinti & Parker Ltd would like to remove an item from the Next website for whatever reason. A stock update of zero will update the item to show "Currently unavailable" on the Next website. Positive stock levels later submitted will push the item onto the Next website again.

KornitX holds a running total, which is changed when a new stock level is submitted, or decremented if an order is taken. If a 0 stock level is not sent when stock is not available we will offer the item on the website until we run out of the last submitted stock level.

> **Note:** Removing a barcode from the stock feed will not set the quantity available to 0 in KornitX.

---

### Shipping API

KornitX has developed order status update APIs to allow you to provide the shipping status of each order to the Next platform.

The following are examples of the API calls required to set the status of orders received from the Next platform.

In order to log updates correctly, a minimum gap of 20 minutes from receiving the order should be left until a status update is sent.

#### Single Item Shipping Status Update

These single item order status update APIs allow you to provide an order status update for each single item ordered.

For the single item order status API, `:id` is the order ID, which we would supply when sending orders to your API. `REFID` is the KornitX account code and `<KEY>` is the API Key to be confirmed with authentication details.

There are two status options for Label Plus: dispatched and cancelled, depending on whether an order can be fulfilled.

**Dispatch** — to indicate that an order is fulfilled:

```bash
curl -X PUT -d '{ "status": 8 }' \
-H "authorization: basic REFID:<KEY>" \
-H "content-type: application/json" \
"https://api-sl-2-2.custom-gateway.net/order/:id/status"
```

**Cancel** — to cancel an order where it cannot be fulfilled:

```bash
curl -X PUT -d '{ "status": 128 }' \
-H "authorization: basic REFID:<KEY>" \
-H "content-type: application/json" \
"https://api-sl-2-2.custom-gateway.net/order/:id/status"
```

#### Multi-item Shipping Status Update

This shipping status update enables you to provide batched order status updates in one API call.

Note the `id` in this instance is the `ItemID` included in the order file. `REFID` is the KornitX account code and `<KEY>` is the API Key to be confirmed with authentication details.

There are two status options for Label Plus, dispatch and cancel, depending on whether an order can be fulfilled. In the multi-item shipping status API, the following status codes should be used:

- `status 3` = dispatch
- `status 7` = cancel

```bash
curl -d '[
  {"id":289907647,"data":{"status":3}},
  {"id":289907821,"data":{"status":7}}
]' \
-H "Authorization: Basic REFID:<KEY>" \
"https://api-sl-2-2.custom-gateway.net/order-item/status"
```
