/**
 * geo.js - 经纬度 → 静态底图百分比坐标 换算工具
 *
 * 背景：综合预览底图为「百度静态图 API」截取的 HDU 卫星图（一张固定 PNG）。
 *       传感器/人员在数据库存的是真实 BD09 经纬度，需换算成图片上的百分比位置，
 *       才能复用现有 AlertPin / DevicePopup 的「left%/top% 绝对定位」逻辑。
 *
 * ⚠️ MAP_META 必须与下载 hdu.png 时用的百度静态图参数完全一致，
 *    否则打点会整体偏移：
 *    https://api.map.baidu.com/staticimage/v2?ak=...
 *      &center=120.349678,30.320160&zoom=18&width=640&height=640&maptype=satellite
 */

// 下载 hdu.png 时用的百度静态图参数（坐标为 BD09）
export const MAP_META = {
  center: [120.349678, 30.320160], // 图片中心经纬度（BD09）
  zoom: 18,
  width: 640,
  height: 640,
};

// 整体缩放微调：肉眼对齐时，若打点相对建筑物「太分散」调小、「太密集」调大（默认 1）。
// 用于补偿百度 zoom 与标准 Web 墨卡托每像素米数的细微差异，对齐后固定即可。
const SCALE = 1.0;

const toRad = (d) => (d * Math.PI) / 180;

// 百度地图 zoom=z 的每像素米数 = 2^(18-z)（zoom 18 = 1 米/像素）。
// 百度瓦片分辨率与标准 Web 墨卡托不同，必须用此公式与 BD09 墨卡托投影配套，
// 否则离图心越远缩放偏差越大（边缘可差上百米）。
const baiduResolution = (zoom) => Math.pow(2, 18 - zoom);

// ── 百度官方 BD09 ↔ BD09 墨卡托（米）转换 ────────────────────────────────
// 百度纬度方向用「分纬度带 6 次多项式」拟合，与标准墨卡托不同，故必须用其官方算法
// 才能消除纬度方向十几~二十米的偏差。经度方向接近线性，与简化算法基本一致。
const LL_BAND = [75, 60, 45, 30, 15, 0];
const LL2MC = [
  [-0.0015702102444, 111320.7020616939, 1704480524535203, -10338987376042340, 26112667856603880, -35149669176653700, 26595700718403920, -10725012454188240, 1800819912950474, 82.5],
  [0.0008277824516172526, 111320.7020463578, 647795574.6671607, -4082003173.641316, 10774905663.51142, -15171875531.51559, 12053065338.62167, -5124939663.577472, 913311935.9512032, 67.5],
  [0.00337398766765, 111320.7020202162, 4481351.045890365, -23393751.19931662, 79682215.47186455, -115964993.2797253, 97236711.15602145, -43661946.33752821, 8477230.501135234, 52.5],
  [0.00220636496208, 111320.7020209128, 51751.86112841131, 3796837.749470245, 992013.7397791013, -1221952.21711287, 1340652.697009075, -620943.6990984312, 144416.9293806241, 37.5],
  [-0.0003441963504368392, 111320.7020576856, 278.2353980772752, 2485758.690035394, 6070.750963243378, 54821.18345352118, 9540.606633304236, -2710.55326746645, 1405.483844121726, 22.5],
  [-0.0003218135878613132, 111320.7020701615, 0.00369383431289, 823725.6402795718, 0.46104986909093, 2351.343141331292, 1.58060784298199, 8.77738589078284, 0.37238884252424, 7.45],
];
const MC_BAND = [12890594.86, 8362377.87, 5591021, 3481989.83, 1678043.12, 0];
const MC2LL = [
  [1.410526172116255e-8, 0.00000898305509648872, -1.9939833816331, 200.9824383106796, -187.2403703815547, 91.6087516669843, -23.38765649603339, 2.57121317296198, -0.03801003308653, 17337981.2],
  [-7.435856389565537e-9, 0.000008983055097726239, -0.78625201886289, 96.32687599759846, -1.85204757529826, -59.36935905485877, 47.40033549296737, -16.50741931063887, 2.28786674699375, 10260144.86],
  [-3.030883460898826e-8, 0.00000898305509983578, 0.30071316287616, 59.74293618442277, 7.357984074871, -25.38371002664745, 13.45380521110908, -3.29883767235584, 0.32710905363475, 6856817.37],
  [-1.981981304930552e-8, 0.000008983055099779535, 0.03278182852591, 40.31678527705744, 0.65659298677277, -4.44255534477492, 0.85341911805263, 0.12923347998204, -0.04625736007561, 4482777.06],
  [3.09191371068437e-9, 0.000008983055096812155, 0.00006995724062, 23.10934304144901, -0.00023663490511, -0.6321817810242, -0.00663494467273, 0.03430082397953, -0.00466043876332, 2555164.4],
  [2.890871144776878e-9, 0.000008983055095805407, -3.068298e-8, 7.47137025468032, -0.00000353937994, -0.02145144861037, -0.00001234426596, 0.00010322952773, -0.00000323890364, 826088.5],
];

function poly(c, value, base) {
  const t = Math.abs(value) / base;
  return (
    c[2] +
    c[3] * t +
    c[4] * t * t +
    c[5] * t ** 3 +
    c[6] * t ** 4 +
    c[7] * t ** 5 +
    c[8] * t ** 6
  );
}

// BD09 经纬度 → 百度墨卡托米 [mcx, mcy]
function bd09ToMercator(lng, lat) {
  const clampLat = Math.max(-74, Math.min(74, lat));
  let band = LL2MC[LL2MC.length - 1];
  for (let i = 0; i < LL_BAND.length; i++) {
    if (clampLat >= LL_BAND[i]) {
      band = LL2MC[i];
      break;
    }
  }
  const mcx = (band[0] + band[1] * Math.abs(lng)) * (lng < 0 ? -1 : 1);
  const mcy = poly(band, clampLat, band[9]) * (clampLat < 0 ? -1 : 1);
  return [mcx, mcy];
}

// 百度墨卡托米 → BD09 经纬度 [lng, lat]
function mercatorToBd09(mcx, mcy) {
  let band = MC2LL[MC2LL.length - 1];
  for (let i = 0; i < MC_BAND.length; i++) {
    if (Math.abs(mcy) >= MC_BAND[i]) {
      band = MC2LL[i];
      break;
    }
  }
  const lng = (band[0] + band[1] * Math.abs(mcx)) * (mcx < 0 ? -1 : 1);
  const lat = poly(band, mcy, band[9]) * (mcy < 0 ? -1 : 1);
  return [lng, lat];
}

/**
 * BD09 经纬度 → 底图百分比坐标 {x, y}。
 * 返回值一般在 0~100，超出表示该点落在图片范围之外。
 * 用百度官方投影把经纬度转成墨卡托米，再按该 zoom 的每像素米数换算到图上像素。
 *
 * @param {number} lng BD09 经度
 * @param {number} lat BD09 纬度
 * @returns {{x:number, y:number}} 百分比坐标
 */
export function lngLatToPercent(lng, lat) {
  const [cLng, cLat] = MAP_META.center;
  const res = baiduResolution(MAP_META.zoom); // 米/像素
  const [mcx, mcy] = bd09ToMercator(lng, lat);
  const [cx, cy] = bd09ToMercator(cLng, cLat);
  // 墨卡托米偏移 → 像素（纬度越大越靠图上方，故 y 取负），叠加整体缩放
  const dxPx = ((mcx - cx) / res) * SCALE;
  const dyPx = (-(mcy - cy) / res) * SCALE;
  // 像素 → 百分比（图心 = 50%,50%）
  return {
    x: 50 + (dxPx / MAP_META.width) * 100,
    y: 50 + (dyPx / MAP_META.height) * 100,
  };
}

/**
 * 底图百分比坐标 → BD09 经纬度（lngLatToPercent 的逆运算）。
 * 用于把鼠标在地图上的位置换算成经纬度显示。
 *
 * @param {number} x 百分比横坐标（0~100）
 * @param {number} y 百分比纵坐标（0~100）
 * @returns {{lng:number, lat:number}} BD09 经纬度
 */
export function percentToLngLat(x, y) {
  const [cLng, cLat] = MAP_META.center;
  const res = baiduResolution(MAP_META.zoom);
  const [cx, cy] = bd09ToMercator(cLng, cLat);
  const dxPx = ((x - 50) / 100) * MAP_META.width;
  const dyPx = ((y - 50) / 100) * MAP_META.height;
  const mcx = cx + (dxPx * res) / SCALE;
  const mcy = cy - (dyPx * res) / SCALE;
  const [lng, lat] = mercatorToBd09(mcx, mcy);
  return { lng, lat };
}

/**
 * WGS84（GPS/北斗实测）→ BD09（百度）。
 * 若传感器实测坐标为 WGS84，入库或打点前先过这个函数转成 BD09，
 * 再交给 lngLatToPercent，否则会偏移上百米。
 *
 * @returns {{lng:number, lat:number}} BD09 经纬度
 */
const X_PI = (Math.PI * 3000) / 180;
export function wgs84ToBd09(lng, lat) {
  // 1) WGS84 → GCJ-02
  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  const dLat0 = transformLat(lng - 105.0, lat - 35.0);
  const dLng0 = transformLng(lng - 105.0, lat - 35.0);
  const radLat = toRad(lat);
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLat =
    (dLat0 * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  const dLng = (dLng0 * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  const gcjLat = lat + dLat;
  const gcjLng = lng + dLng;
  // 2) GCJ-02 → BD09
  const z =
    Math.sqrt(gcjLng * gcjLng + gcjLat * gcjLat) +
    0.00002 * Math.sin(gcjLat * X_PI);
  const theta =
    Math.atan2(gcjLat, gcjLng) + 0.000003 * Math.cos(gcjLng * X_PI);
  return {
    lng: z * Math.cos(theta) + 0.0065,
    lat: z * Math.sin(theta) + 0.006,
  };
}

function transformLat(lng, lat) {
  let ret =
    -100.0 +
    2.0 * lng +
    3.0 * lat +
    0.2 * lat * lat +
    0.1 * lng * lat +
    0.2 * Math.sqrt(Math.abs(lng));
  ret +=
    ((20.0 * Math.sin(6.0 * lng * Math.PI) +
      20.0 * Math.sin(2.0 * lng * Math.PI)) *
      2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(lat * Math.PI) +
      40.0 * Math.sin((lat / 3.0) * Math.PI)) *
      2.0) /
    3.0;
  ret +=
    ((160.0 * Math.sin((lat / 12.0) * Math.PI) +
      320 * Math.sin((lat * Math.PI) / 30.0)) *
      2.0) /
    3.0;
  return ret;
}

function transformLng(lng, lat) {
  let ret =
    300.0 +
    lng +
    2.0 * lat +
    0.1 * lng * lng +
    0.1 * lng * lat +
    0.1 * Math.sqrt(Math.abs(lng));
  ret +=
    ((20.0 * Math.sin(6.0 * lng * Math.PI) +
      20.0 * Math.sin(2.0 * lng * Math.PI)) *
      2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(lng * Math.PI) +
      40.0 * Math.sin((lng / 3.0) * Math.PI)) *
      2.0) /
    3.0;
  ret +=
    ((150.0 * Math.sin((lng / 12.0) * Math.PI) +
      300.0 * Math.sin((lng / 30.0) * Math.PI)) *
      2.0) /
    3.0;
  return ret;
}
