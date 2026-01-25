## Debugging Notes

Fabric Endorsement Policy Issue:
- CreateAsset returned 200 but data didn't persist
- Root cause: Default policy requires Org1MSP AND Org2MSP
- Solution: Added --peerAddresses localhost:9051 for Org2
- Result: 80% performance improvement validated

