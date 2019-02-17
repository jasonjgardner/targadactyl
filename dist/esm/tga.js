/**
 * @license tga-js 1.1.0
 * Copyright (c) 2013-2019 Vincent Thibault, Inc.
 * License: MIT
 */
const e=0,t=1,a=3,r=9,o=10,i=11,s=0,h=2,n=3,g=4,l=48;export default class{_checkHeader(){const t=this.header;if(t.imageType===e)throw Error("No data");if(t.hasColorMap){if(t.colorMapLength>256||24!==t.colorMapDepth||1!==t.colorMapType)throw Error("Invalid colormap for indexed type")}else if(t.colorMapType)throw Error("Why does the image contain a palette ?");if(!t.width||!t.height)throw Error("Invalid image size");if(8!==t.pixelDepth&&16!==t.pixelDepth&&24!==t.pixelDepth&&32!==t.pixelDepth)throw Error('Invalid pixel size "'+t.pixelDepth+'"')}_decodeRLE(e,t,a,r){const o=new Uint8Array(r),i=new Uint8Array(a);let s=0;for(;s<r;){const r=e[t++];let h=1+(127&r);if(128&r){for(let r=0;r<a;++r)i[r]=e[t+r];t+=a;for(let e=0;e<h;++e)o.set(i,s),s+=a}else{h*=a;for(let a=0;a<h;++a)o[s+a]=e[t+a];s+=h,t+=h}}return o}_getImageData8bits(e,t,a,r,o,i,s,h,n,g){for(let l=0,p=o;p!==s;p+=i)for(let o=h;o!==g;o+=n,l++){const i=t[l];e[4*(o+r*p)+3]=255,e[4*(o+r*p)+2]=a[3*i+0],e[4*(o+r*p)+1]=a[3*i+1],e[4*(o+r*p)+0]=a[3*i+2]}return e}_getImageData16bits(e,t,a,r,o,i,s,h,n,g){for(let a=0,l=o;l!==s;l+=i)for(let o=h;o!==g;o+=n,a+=2){const i=t[a+0]|t[a+1]<<8;e[4*(o+r*l)+0]=(31744&i)>>7,e[4*(o+r*l)+1]=(992&i)>>2,e[4*(o+r*l)+2]=(31&i)>>3,e[4*(o+r*l)+3]=32768&i?0:255}return e}_getImageData24bits(e,t,a,r,o,i,s,h,n,g){for(let a=0,l=o;l!==s;l+=i)for(let o=h;o!==g;o+=n,a+=3)e[4*(o+r*l)+3]=255,e[4*(o+r*l)+2]=t[a+0],e[4*(o+r*l)+1]=t[a+1],e[4*(o+r*l)+0]=t[a+2];return e}_getImageData32bits(e,t,a,r,o,i,s,h,n,g){for(let a=0,l=o;l!==s;l+=i)for(let o=h;o!==g;o+=n,a+=4)e[4*(o+r*l)+2]=t[a+0],e[4*(o+r*l)+1]=t[a+1],e[4*(o+r*l)+0]=t[a+2],e[4*(o+r*l)+3]=t[a+3];return e}_getImageDataGrey8bits(e,t,a,r,o,i,s,h,n,g){for(let a=0,l=o;l!==s;l+=i)for(let o=h;o!==g;o+=n,a++){const i=t[a];e[4*(o+r*l)+0]=i,e[4*(o+r*l)+1]=i,e[4*(o+r*l)+2]=i,e[4*(o+r*l)+3]=255}return e}_getImageDataGrey16bits(e,t,a,r,o,i,s,h,n,g){for(let a=0,l=o;l!==s;l+=i)for(let o=h;o!==g;o+=n,a+=2)e[4*(o+r*l)+0]=t[a+0],e[4*(o+r*l)+1]=t[a+0],e[4*(o+r*l)+2]=t[a+0],e[4*(o+r*l)+3]=t[a+1];return e}open(e,t){const a=new XMLHttpRequest;a.responseType="arraybuffer",a.open("GET",e,!0),a.onload=(()=>{200===this.status&&(this.load(new Uint8Array(a.response)),t&&t())}),a.send(null)}load(e){let s=0;if(e.length<18)throw Error("Not enough data to contain header");const h={idLength:e[s++],colorMapType:e[s++],imageType:e[s++],colorMapIndex:e[s++]|e[s++]<<8,colorMapLength:e[s++]|e[s++]<<8,colorMapDepth:e[s++],offsetX:e[s++]|e[s++]<<8,offsetY:e[s++]|e[s++]<<8,width:e[s++]|e[s++]<<8,height:e[s++]|e[s++]<<8,pixelDepth:e[s++],flags:e[s++]};if(h.hasEncoding=h.imageType===r||h.imageType===o||h.imageType===i,h.hasColorMap=h.imageType===r||h.imageType===t,h.isGreyColor=h.imageType===i||h.imageType===a,this.header=h,this._checkHeader(),(s+=h.idLength)>=e.length)throw Error("No data");if(h.hasColorMap){const t=h.colorMapLength*(h.colorMapDepth>>3);this.palette=e.subarray(s,s+t),s+=t}const n=h.pixelDepth>>3,g=h.width*h.height,l=g*n;h.hasEncoding?this.imageData=this._decodeRLE(e,s,n,l):this.imageData=e.subarray(s,s+(h.hasColorMap?g:l))}getImageData(e){const{width:t,height:a,flags:r,pixelDepth:o,isGreyColor:i}=this.header,p=(r&l)>>g;let c,d,m,f,D,y,u;switch(e||(e=document?document.createElement("canvas").getContext("2d").createImageData(t,a):{width:t,height:a,data:new Uint8ClampedArray(t*a*4)}),p===h||p===n?(f=0,D=1,y=a):(f=a-1,D=-1,y=-1),p===h||p===s?(c=0,d=1,m=t):(c=t-1,d=-1,m=-1),o){case 8:u=i?this._getImageDataGrey8bits:this._getImageData8bits;break;case 16:u=i?this._getImageDataGrey16bits:this._getImageData16bits;break;case 24:u=this._getImageData24bits;break;case 32:u=this._getImageData32bits}return u.call(this,e.data,this.imageData,this.palette,t,f,D,y,c,d,m),e}getCanvas(){const{width:e,height:t}=this.header,a=document.createElement("canvas"),r=a.getContext("2d"),o=r.createImageData(e,t);return a.width=e,a.height=t,r.putImageData(this.getImageData(o),0,0),a}getDataURL(e){return this.getCanvas().toDataURL(e||"image/png")}}
