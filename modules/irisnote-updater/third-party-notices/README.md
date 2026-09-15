# Upstream binary notices

HDiffPatch 5.1.3 Android SDK binaries are distributed unchanged. HDiffPatch's MIT
license is in `../HDiffPatch-LICENSE`. Its default Android build includes the
following compression/checksum components; retained upstream notices are provided
alongside this file:

- zstd: BSD license, `zstd-LICENSE` (https://github.com/facebook/zstd).
- xxHash: BSD license, `xxHash-LICENSE` (https://github.com/Cyan4973/xxHash).
- libmd5: upstream header and license, `libmd5-header.txt` (https://github.com/sisong/libmd5).
- LZMA decoder: Igor Pavlov, public domain. Upstream `C/LzmaDec.c` begins
  `LzmaDec.c -- LZMA Decoder / 2023-04-07 : Igor Pavlov : Public domain`.
  Source: https://github.com/sisong/lzma/blob/master/C/LzmaDec.c
- zlib is linked to Android's platform `libz.so`.

Upstream build configuration:
https://github.com/sisong/HDiffPatch/blob/v5.1.3/builds/android_ndk_jni_mk/Android.mk
