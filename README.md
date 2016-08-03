POC incremental NativeScript prepare phase
==========================================

Incremental prepare phase for the NativeScript framework.
The project aims at fast generation of the resources added to the app in the `platforms` directory.

Cold full build: 28.590s (After this the FS caches the files)
Hot full build: 2.874s prepare, 6.879s sync
Incremental build with 2 files changed: 0.314s prepare, 3.171s sync

prepare - builds the files at platform/ios/<app>/app
sync - zips diff and uploads it to the device:

```
Unzipped 5267 entries in 6013.940036ms.
```

This POC prepare script can be tested for iOS adding the following npm scripts:
```
  "scripts": {
    "prepare:ios": "prepare ios platforms/ios/SampleAppNG2"
  }
```

Later ios-deploy can be chained to upload the produced sync .zip:
```
  "scripts": {
    "deploy:ios": "time ios-deploy -1 org.nativescript.SampleAppNG2 -i f5ae7a02a8ba77fa572a0e6a7d869a194805bfed -2 '/Library/Application Support/LiveSync/sync.zip' -o platforms/ios/lifesync/lifesync.zip"
  }
```

Reminder: We should give `fs.link` on NTFS a try, the current implementation copies the files but link should be somewhat faster and will save some content checks.
