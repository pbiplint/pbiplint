---
title: Self-hosting checklist
description: A one-page record of a self-hosted pbiplint deployment for a security approval ticket, to print and fill in.
---

# Self-hosting checklist

For a copy of pbiplint hosted as [Host pbiplint yourself](/self-host/) describes. Print this page, fill it in, and attach it to the approval ticket. Run it again after every update.

## The release

| Check | Record |
| --- | --- |
| Release deployed (for example v{{version}}) | |
| SHA-256 of the zip, as checked, and whether it matches `SHA256SUMS` | |
| `gh attestation verify` passed (yes, no, or not run) | |
| Build marker on the site (`pbiplint-build`), and the tag's commit | |

## The storage account

| Check | Record |
| --- | --- |
| Subscription, resource group, and account name | |
| Public network access and shared key access Disabled, minimum TLS 1.2 | |
| Private endpoints `web` and `blob`: approved, on subnet | |
| From outside the network: the site answers 404, the blob address 403 | |
| Delete lock present | |
| Diagnostic setting sends writes and deletes to workspace | |
| Group with write access, and its members reviewed | |

## The egress check

| Check | Record |
| --- | --- |
| Date and time run | |
| Machine it ran on | |
| Result (PASS, or the requests it listed) | |

## Sign-off

| Check | Record |
| --- | --- |
| Checked by, and date | |
| Approved by, and date | |
