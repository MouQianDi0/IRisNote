package com.github.sisong;

public class HPatch{

    // load libhpatchz.so
    static { System.loadLibrary("hpatchz"); }

    //patch:
    //  return THPatchResult, 0 is ok, other is error;
    //  cacheMemory:
    //    cacheMemory is used for file IO, different cacheMemory only affects patch speed;
    //    recommended 1024*1024*1,1024*1024*8,...
    //    NOTE: if diffFile created by $hdiffz -w[-*] -VCD[-*], $xdelta3(-S,-S lzma),$open-vcdiff, alloc memory=cacheMemory+sourceWindowSize+targetWindowSize;
    //        ( sourceWindowSize & targetWindowSize is set when diff, C API getVcDiffInfo() can got values from diffFile. )
    //  if need VCDIFF ($hdiffz -VCD or xdelta3 or open-vcdiff ) format support, build .so with VCD=1 can opened;
    //  if need bsdiff4 & endsley/bsdiff format support, build .so with BSD=1 BZIP2=1 can opened;
    //  if need supported oldFileName or outNewFileName is directory, build .so with DIR=1 can opened;
    //  threadNum: 1..5, default 1; >1 opened multi-thread patching;
    //      now support single compressed diffData(created by hdiffz -SD) & window diffData(created by hdiffz -WD, recommended)
    //  isChecksumNewData: default true; auto checksum newData when patching VCDIFF and window diffData;
    public static native int patch(String oldFileName,String diffFileName,String outNewFileName,long cacheMemory,int _threadNum,boolean isChecksumNewData);
    public static final int patch(String oldFileName,String diffFileName,String outNewFileName,long cacheMemory,int _threadNum){
        return patch(oldFileName,diffFileName,outNewFileName,cacheMemory,_threadNum,true);
    }
    public static final int patch(String oldFileName,String diffFileName,String outNewFileName,long cacheMemory){
        return patch(oldFileName,diffFileName,outNewFileName,cacheMemory,1,true);
    }
    public static final int patch(String oldFileName,String diffFileName,String outNewFileName){
        return patch(oldFileName,diffFileName,outNewFileName,1024*1024*4,1,true);
    }
}
