<template>
  <input
    @change="loadImgFile"
    type="file"
    ref="imgFileInput"
    accept="image/*"
    style="display: none"
  />
  <input
    @change="loadJsonFile"
    type="file"
    ref="jsonFileInput"
    accept=".json"
    style="display: none"
  />
  <div class="container">
    <div @wheel="onWheel" class="image-container" ref="divRef">
      <canvas
        @click="toggleDot"
        @mousemove="updateZoomView"
        ref="canvas"
        :width="viewportWidth + offsetCanvasLeft"
        :height="viewportHeight + offsetCanvasTop"
        :style="`transform: translate(${-offsetCanvasLeft}px, ${-offsetCanvasTop}px);
                transform-origin: 0% 0%;`"
      ></canvas>
      <div
        @click="deleteDot"
        v-for="dot in dotsCanvasCoor"
        class="dot"
        :key="dot.id"
        :style="`
              transform: translate(${-offsetCanvasLeft}px, ${-offsetCanvasTop}px) scale(${scale});
              transform-origin: 0% 0%;
              top: ${dot.y}px;
              left: ${dot.x}px;
              z-index: 9998;
            `"
      ></div>
      <div
        v-if="scale < gridLimit"
        class="rectangle"
        :style="`
              transform: translate(${-offsetCanvasLeft}px, ${-offsetCanvasTop}px) scale(${scale});
              transform-origin: 0% 0%;
              z-index: 9998;
            `"
      ></div>
      <div
        style="
          display: flex;
          position: fixed;
          left: 5%;
          bottom: 25px;
          width: calc(60% + 60px);
          z-index: 9999;
        "
      >
        <input
          type="number"
          min="0.1"
          :max="scaleRange"
          step="0.1"
          v-model.number="scale"
          v-if="imageSrc"
          style="width: 60px"
        />
        <input
          type="range"
          min="1"
          :max="scaleRange"
          step="1"
          v-model.number="scale"
          v-if="imageSrc"
          style="width: calc(100% - 60px)"
        />
      </div>
    </div>
    <div class="tool-container">
      <div>
        <div class="zoomViewBox">
          <canvas
            ref="zoomView"
            id="zoom"
            class="zoom-style"
            width="120"
            height="120"
          ></canvas>
        </div>
        <div>
          <input type="checkbox" v-model="selectedOption" @click="checkClass" value="DBR">DBR<br>
          <input type="checkbox" v-model="selectedOption" @click="checkClass" value="DDN">DDN<br>
          <input type="checkbox" v-model="selectedOption" @click="checkClass" value="DLR">DLR<br>
        </div>
        <div class="fileInfo-style">数据集: {{ jsonFileName }}</div>
        <div class="fileInfo-style">图片: {{ imgFileName }}</div>
        <div
          v-for="(item, index) in dotsRealCoor"
          :key="index"
        >
          <span>({{ item.x }}, {{ item.y }})</span>
          <button @click="clearMessage(index)" class="button-delete-style">x</button>
        </div>
      </div>
      <div class="button-group">
        <button @click="chooseJsonFile" class="button-style">Get JsonFile</button>
        <button @click="chooseImgFile" class="button-style">Get Picture</button>
        <button @click="saveDots" class="button-style">Save Dots</button>
        <button @click="clearDots" class="button-style">Clear Dots</button>
        <button @click="resetPosition" class="button-style">
          Reset Position
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useMouse, useMousePressed } from '@vueuse/core';
import { resetJsonProcess, setQuadInfo, getDefultQuadIndex } from './JsonProcess.js';

const offsetCanvasLeft = 22;
const offsetCanvasTop = 22;

const imgFileInput = ref(null);
const jsonFileInput = ref(null);
const divRef = ref(null);
const viewportWidth = ref(0);
const viewportHeight = ref(0);

const canvas = ref(null);
const ctx = ref(null);
const initImgWidth = ref(0);
const initImgHeight = ref(0);

let mouseMoved = false;
let timer = null;
let isNotLongPress = true;
const dotsCanvasCoor = ref([]);
const dotsRealCoor = ref([]);

// for zoom
const realDot2GetZoom = ref({ x: -1, y: -1 });

const offsetX = ref(0);
const offsetY = ref(0);
const scale = ref(0);
const imageObj = ref(null);
const imageSrc = ref('');

const { pressed } = useMousePressed({ target: divRef });
const { x, y } = useMouse();

// Basic delete
function deletePt(ptIndex){
  if (ptIndex !== -1 && ptIndex < dotsCanvasCoor.value.length) {
    dotsCanvasCoor.value.splice(ptIndex, 1);
    dotsRealCoor.value.splice(ptIndex, 1);
    drawZoomAnddots();
    return true;
  }
  return false;
};

// Delete Dot in canvas
function deleteDot(e){
  const { existingDotIndex } = getDotInfo(e);
  if (!deletePt(existingDotIndex)) {
    console.log('Error delete the pt in canvas!');
  }
};

function getDotInfo(e){
  let canvasCoor = {
    x: e.clientX,
    y: e.clientY,
  };
  let realCoor = { x: 0, y: 0 };

  transCanvas2RealInfo(realCoor, canvasCoor); // 得到原始图片对应坐标
  transReal2CanvasInfo(canvasCoor, realCoor); // 得到贴合后画布确切坐标

  const existingDotIndex = dotsRealCoor.value.findIndex(
    (realDot) =>
      Math.abs(realDot.x - realCoor.x) < 2 &&
      Math.abs(realDot.y - realCoor.y) < 2
  );
  // console.log('***********getDotInfo');
  // console.log('e.client: (' + e.clientX + ', ' + e.clientY + ')');
  // console.log('canvasCoor: (' + canvasCoor.x + ', ' + canvasCoor.y + ')');
  // console.log('realCoor: (' + realCoor.x + ', ' + realCoor.y + ')');
  return { canvasCoor, realCoor, existingDotIndex };
};

const imgPixelData2D = [];
function updataImgData()
{
   // 创建一个Canvas对象
   let canvasTmp = document.createElement('canvas');
   canvasTmp.width = initImgWidth.value;
   canvasTmp.height = initImgHeight.value;

  // 将图像绘制到Canvas上
  var ctxTmp = canvasTmp.getContext('2d');
  ctxTmp.drawImage(imageObj.value, 0, 0);

  // 获取图像像素的颜色矩阵
  const imgPixelData = ctxTmp.getImageData(0, 0, canvasTmp.width, canvasTmp.height).data;

  for (let x = 0; x < canvasTmp.width; ++x) {
    imgPixelData2D[x] = [];
    for (let y = 0; y < canvasTmp.height; ++y) {
      const i = (y * canvasTmp.width + x) * 4;
      const r = imgPixelData[i];
      const g = imgPixelData[i + 1];
      const b = imgPixelData[i + 2];
      const a = imgPixelData[i + 3];
      const cssColor = `rgba(${r}, ${g}, ${b}, ${a})`;
      imgPixelData2D[x][y] = cssColor;
    }
    //console.log(imgPixelData2D);
  }
}

// Only draw the part of img inside the viewport
const canvasLTCoor = { x: 0, y: 0 };
const canvasRBCoor = { x: 0, y: 0 };
const sourceLTCoor = { x: 0, y: 0 };
const gridLimit = 10;
function drawCanvas(){
  if (canvas === null || canvas.value === null) {
    console.log('drawCanvas canvas Error.');
    return;
  }
  if (
    offsetX.value >= viewportWidth.value ||
    offsetY.value >= viewportHeight.value ||
    offsetX.value <= -initImgWidth.value * scale.value ||
    offsetY <= -initImgHeight.value * scale.value
  ) {
    console.log('drawCanvas offset Error.');
    return;
  }

  // Calc Overlap area
  const x1 = Math.max(0, offsetX.value);
  const x2 = Math.min(
    viewportWidth.value - 1,
    offsetX.value + initImgWidth.value * scale.value - 1
  );
  const y1 = Math.max(0, offsetY.value);
  const y2 = Math.min(
    viewportHeight.value - 1,
    offsetY.value + initImgHeight.value * scale.value - 1
  );
  let imgScaledLTCoor = { x: x1 - offsetX.value, y: y1 - offsetY.value };
  let imgScaledRBCoor = { x: x2 - offsetX.value, y: y2 - offsetY.value };

  //Calc letf-top and right-bottom pts in canvas
  let sourceRBCoor = { x: 0, y: 0 };

  transScaled2RealInfo(sourceLTCoor, imgScaledLTCoor);
  transScaled2RealInfo(sourceRBCoor, imgScaledRBCoor);

  transReal2ScaledInfo(imgScaledLTCoor, sourceLTCoor); // 使点位置与图片像素贴合
  transReal2ScaledInfo(imgScaledRBCoor, {
    x: sourceRBCoor.x + 2,
    y: sourceRBCoor.y + 2,
  }); //得到目标范围外的右下一点，用以后续计算dw dh

  const sw = Math.abs(sourceLTCoor.x - sourceRBCoor.x) + 2;
  const sh = Math.abs(sourceLTCoor.y - sourceRBCoor.y) + 2;
  const dw = Math.abs(imgScaledRBCoor.x - imgScaledLTCoor.x);
  const dh = Math.abs(imgScaledRBCoor.y - imgScaledLTCoor.y);

  transScaled2CanvasInfo(canvasLTCoor, imgScaledLTCoor);
  transScaled2CanvasInfo(canvasRBCoor, imgScaledRBCoor);

  //Draw
  ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
  if(scale.value < gridLimit)
  {
    initCanvasSettings();
    ctx.value.drawImage(
        imageObj.value,
        sourceLTCoor.x,
        sourceLTCoor.y,
        sw,
        sh,
        canvasLTCoor.x,
        canvasLTCoor.y,
        dw,
        dh
      );
  }
  else
  {
    drawGrid();
    drawImgInGrid(sw, sh);
  }

};

// Area: [canvasLTCoor, canvasRBCoor)
function drawGrid(){
  // 设置间隔
  const space = scale.value + 1;
  // 区域的左上和右下
  const areaX1 = canvasLTCoor.x, areaX2 = Math.min(canvasRBCoor.x, canvas.value.width) - 1;
  const areaY1 = canvasLTCoor.y, areaY2 = Math.min(canvasRBCoor.y, canvas.value.height) - 1;
  // 设置虚线
  ctx.value.setLineDash([]);

  // 绘制水平方向的网格线
  for(let y = areaY1; y <= areaY2; y += space){
      ctx.value.beginPath();
      ctx.value.moveTo(areaX1, y);
      ctx.value.lineTo(areaX2, y);
      ctx.value.stroke();
  }

  // 绘制垂直方向的网格线
  for(let x = areaX1; x <= areaX2; x += space){
      ctx.value.beginPath();
      ctx.value.moveTo(x, areaY1);
      ctx.value.lineTo(x, areaY2);
      ctx.value.stroke();
  }
}

function drawImgInGrid(sourceWidth, sourceHeight)
{
  const space = scale.value + 1;
  const dw = scale.value, dh = scale.value;
  const startX = canvasLTCoor.x + 1, startY = canvasLTCoor.y + 1; // 包括最左/上侧网格线

  for (let shOffset = 0; shOffset < sourceHeight; ++shOffset)
  {
    const canvasY = startY + shOffset * space;
    const sourceY = sourceLTCoor.y + shOffset;
    for (let swOffset = 0; swOffset < sourceWidth; ++swOffset)
    {
      const canvasX = startX + swOffset * space;
      const sourceX = sourceLTCoor.x + swOffset;
      ctx.value.fillStyle = imgPixelData2D[sourceX][sourceY];
      ctx.value.fillRect(canvasX, canvasY, dw, dh);
      // ctx.value.drawImage(
      //   imageObj.value,
      //   sourceX,
      //   sourceY,
      //   1,
      //   1,
      //   canvasX,
      //   canvasY,
      //   dw,
      //   dh
      // );
    }
  }
}


function drawZoomAnddots(){
  if (realDot2GetZoom.value.x === -1) return;
  const zoomctx = zoomView.value.getContext('2d');
  zoomctx.drawImage(
    imageObj.value,
    realDot2GetZoom.value.x,
    realDot2GetZoom.value.y,
    6,
    6,
    0,
    0,
    120,
    120
  );

  for (let i = 0; i < dotsRealCoor.value.length; ++i) {
    drawDotInZoom(dotsRealCoor.value[i]);
  }
};

function drawDotInZoom(newRealCoor){
  if (realDot2GetZoom.value.x === -1) return;
  const zoomctx = zoomView.value.getContext('2d');
  let transX = newRealCoor.x - realDot2GetZoom.value.x;
  let transY = newRealCoor.y - realDot2GetZoom.value.y;
  if (transX >= 0 && transX < 6 && transY >= 0 && transY < 6) {
    zoomctx.fillRect(transX * 20, transY * 20, 20, 20);
  }
};

function updateViewPortDraw() {
  if (imageSrc === null || imageSrc.value === '') return;
  drawCanvas();
  updateDotsCanvasCoor();
}

// Move
const autoAdaptBorderDis = 10;
watch([x, y], ([newX, newY], [oldX, oldY]) => {
  if (pressed.value) {
    //console.log(`Mouse moved from (${oldX}, ${oldY}) to (${newX}, ${newY})`);
    const deltaX = newX - oldX;
    const deltaY = newY - oldY;
    if (deltaX === 0 && deltaY === 0) return;

    offsetX.value += deltaX;
    offsetY.value += deltaY;

    // auto Adapt Border
    if (!(imageSrc === null || imageSrc.value === '')) {
      if (Math.abs(newX) < Math.abs(oldX)) {
        if (Math.abs(offsetX.value) < autoAdaptBorderDis) offsetX.value = 0;
      } else if (Math.abs(newX) > Math.abs(oldX)){
        if (Math.abs(offsetX.value + initImgWidth.value * scale.value -  viewportWidth.value) < autoAdaptBorderDis)
          offsetX.value = viewportWidth.value - initImgWidth.value * scale.value;
      }

      if (Math.abs(newY) < Math.abs(oldY)) {
        if (Math.abs(offsetY.value) < autoAdaptBorderDis) offsetY.value = 0;
      } else if (Math.abs(newY) > Math.abs(oldY)) {
        if (Math.abs(offsetY.value + initImgHeight.value * scale.value - viewportHeight.value) < autoAdaptBorderDis)
          offsetY.value = viewportHeight.value - initImgHeight.value * scale.value;
      }
    }
    updateViewPortDraw();
  }
});

// Scale
watch(scale, (newScale) => {
  //console.log('scale:', newScale);
  updateViewPortDraw();
});

// Load Img
watch(imageSrc, (newImageSrc) => {
  if (newImageSrc) {
    const img = new Image();
    img.src = newImageSrc;
    img.onload = () => {
      // Update imgInfo
      initImgWidth.value = img.width;
      initImgHeight.value = img.height;
      updataImgData();
      // Update ctx
      if (ctx !== null && ctx.value !== null) {
        ctx.value.clearRect(
          0,
          0,
          ctx.value.canvas.width,
          ctx.value.canvas.height
        );
      }
      ctx.value = canvas.value.getContext('2d');

      // 计算初始缩放比例
      const scaleValue = Math.min(
        viewportWidth.value / img.width,
        viewportHeight.value / img.height
      );
      scale.value = scaleValue; //scale.value修改，自动调用watch scale

      console.log('...Load Pic....................................');
      console.log('scale:', scale);
      console.log('viewportWidth.value:', viewportWidth.value);
      console.log('viewportHeight .value:', viewportHeight.value);
      console.log('img.width:', img.width);
      console.log('img.height:', img.height);
    };
  }
});

// Judge click type
watch(pressed, (newVal) => {
  if (newVal) {
    isNotLongPress = true;
    mouseMoved = false; // 重置鼠标移动状态
    timer = setTimeout(() => {
      isNotLongPress = false;
    }, 150); // 长按时间阈值
  } else {
    clearTimeout(timer);
    if (isNotLongPress && !mouseMoved) {
      // 如果鼠标没有移动
      isNotLongPress = true;
    } else {
      isNotLongPress = false;
    }
  }
});

onMounted(() => {
  console.log('onMounted...');
  initZoomSettings();
  updateViewSize();
  window.addEventListener('resize', updateViewSize);
  window.addEventListener('mousemove', () => {
    mouseMoved = true;
  });
});

onUnmounted(() => {
  console.log('onUnmounted...');
  window.removeEventListener('resize', updateViewSize);
  window.removeEventListener('mousemove', () => {
    mouseMoved = true;
  });
});

/******click */
// Click checkbox to check the class
const selectedOption = ref(["DBR"]);
const classTotalStr = ["DBR", "DDN", "DLR"];
function checkClass(e){
	setTimeout(function(){
		if(selectedOption.value.length===0){
		selectedOption.value.push(classTotalStr[0]);
    }
		if(selectedOption.value.length > 1){
		selectedOption.value.splice(0, 1);
    }
	}, 1);
}

// Click button to del dot
function clearMessage(index){
  deletePt(index);
};

// Click canvas to get dot
function toggleDot(e){
  if (imageSrc == null || imageSrc.value == '' || !isNotLongPress) {
    return;
  }
  // 如果红点在图片显示范围外，输出“The pt is not in the pic.”
  if (
    e.clientX < canvasLTCoor.x ||
    e.clientX >= canvasRBCoor.x ||
    e.clientY < canvasLTCoor.y ||
    e.clientY >= canvasRBCoor.y
  ) {
    console.log('The pt is not in the pic.');
    return;
  }
  console.log('****************************toggleDot');
  const { canvasCoor, realCoor, existingDotIndex } = getDotInfo(e);
  if (existingDotIndex !== -1) {
    // 如果已经存在红点，删除它
    deletePt(existingDotIndex);
    console.log('Delete the pt.');
  } else if (dotsCanvasCoor.value.length >= 4) {
    // 如果已经有四个红点，输出“Already set 4 pts.”
    console.log('Already set 4 pts.');
  } else {
    // 否则，添加一个新的红点
    dotsRealCoor.value.push({ x: realCoor.x, y: realCoor.y });
    updateDotsCanvasCoor();
    drawDotInZoom(realCoor);
    if (dotsRealCoor.value.length === 4)
      setQuadInfo(dotsRealCoor.value);
    //console.log('dotsCanvasCoor.value: ', dotsCanvasCoor.value);
    //console.log('dotsRealCoor.value: ', dotsRealCoor.value);
  }
};

function resetPosition() {
  offsetX.value = 0;
  offsetY.value = 0;
  updateViewPortDraw();
}

function clearDots(){
  dotsCanvasCoor.value = [];
  dotsRealCoor.value = [];
  console.log('cleardots Successfully.');
};

function chooseImgFile(){
  imgFileInput.value.click();
};
function chooseJsonFile(){
  jsonFileInput.value.click();
};

let imgFileName = ref(null);
function loadImgFile(event){
  const file = event.target.files[0];
  imgFileName.value = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    imageSrc.value = e.target.result;
    imageObj.value = new Image();
    scale.value = 0;
    offsetX.value = 0;
    offsetY.value = 0;
    clearDots();
    resetJsonProcess(jsonStr, selectedOption.value[0], imgFileName.value);
    imageObj.value.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

let jsonFileName = ref(null);
let jsonStr = {};
function loadJsonFile(event) {
  const file = event.target.files[0];
  jsonFileName.value = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    jsonStr = e.target.result;
    //setJsonInfos(json);
  };
  reader.readAsText(file);
};

// // 保存JSON文件到本地文件系统
// function saveJsonFile(filename, json) {
//   const jsonString = JSON.stringify(json);
//   const blob = new Blob([jsonString], { type: 'application/json' });
//   const url = URL.createObjectURL(blob);
//   const a = document.createElement('a');
//   a.href = url;
//   a.download = filename;
//   document.body.appendChild(a);
//   a.click();
//   document.body.removeChild(a);
// };
const scaleRange = 60;
const onWheel = (event) => {
  if (event.deltaY < 0) {
    if (scale.value < 0.9) scale.value += 0.1;
    else if (scale.value < scaleRange)scale.value = Math.floor(scale.value + 1);
  } else{
    if (scale.value > 0.2) {
      if (scale.value <= 1) scale.value -= 0.1;
      else scale.value = Math.ceil(scale.value - 1);
    }
    else
      scale.value = 0.1;
  }
};

const zoomView = ref(null);
function updateZoomView(event) {
  if (!imageObj.value) return;

  let canvasCoor = {
    x: event.clientX,
    y: event.clientY,
  };
  transCanvas2RealInfo(realDot2GetZoom.value, canvasCoor);
  // Make the mouse in the middle of the zoomRect
  realDot2GetZoom.value.x = Math.max(realDot2GetZoom.value.x - 3, 0);
  realDot2GetZoom.value.y = Math.max(realDot2GetZoom.value.y - 3, 0);

  // Draw scaled rect in canvas
  let rectCoor = {
    x: realDot2GetZoom.value.x - 1,
    y: realDot2GetZoom.value.y - 1,
  };

  transReal2CanvasInfo(canvasCoor, rectCoor);
  updateRectanglePosition(canvasCoor.x, canvasCoor.y);

  // Draw zoom
  drawZoomAnddots();
}

function updateDotsCanvasCoor() {
  // 新增一个红点
  const realDotsNum = dotsRealCoor.value.length;
  if (dotsCanvasCoor.value.length !== realDotsNum)
  {
    dotsCanvasCoor.value.push({ x: 0, y: 0 });
    transReal2CanvasInfo(dotsCanvasCoor.value[realDotsNum - 1], dotsRealCoor.value[realDotsNum - 1]);
    if (scale.value >= 10)
    {
      dotsCanvasCoor.value[realDotsNum - 1].x += 1;
      dotsCanvasCoor.value[realDotsNum - 1].y += 1;
    }
  }

  // 更新所有点的坐标
  else
  {
    for (let i = 0; i < realDotsNum; ++i) {
      transReal2CanvasInfo(dotsCanvasCoor.value[i], dotsRealCoor.value[i]);
      if (scale.value >= 10)
      {
        dotsCanvasCoor.value[i].x += 1;
        dotsCanvasCoor.value[i].y += 1;
      }
    }
  }
  
}

function transScaled2RealInfo(targetCoor, scaledCoor) {
    targetCoor.x = Math.floor(scaledCoor.x / scale.value);
    targetCoor.y = Math.floor(scaledCoor.y / scale.value);   
}

function transReal2ScaledInfo(targetCoor, realCoor) {
  targetCoor.x = realCoor.x * scale.value;
  targetCoor.y = realCoor.y * scale.value;
}

function transScaled2CanvasInfo(targetCoor, scaledCoor) {
  if (scale.value >= gridLimit) {
    let realCoor = { x: 0, y: 0 };
    transScaled2RealInfo(realCoor, scaledCoor);
    transReal2CanvasInfo(targetCoor, realCoor);
  }
  else
  {
    targetCoor.x = scaledCoor.x + offsetX.value + offsetCanvasLeft;
    targetCoor.y = scaledCoor.y + offsetY.value + offsetCanvasTop;
  }
}

// function transCanvas2ScaledInfo(targetCoor, canvasCoor) {
//   targetCoor.x = canvasCoor.x - offsetX.value - offsetCanvasLeft;
//   targetCoor.y = canvasCoor.y - offsetY.value - offsetCanvasTop;
// }
function transReal2CanvasInfo(targetCoor, realCoor) {
  let xOffsetGrid = 0, yOffsetGrid = 0;
  if (scale.value >= gridLimit) {
    xOffsetGrid = (realCoor.x - sourceLTCoor.x);
    yOffsetGrid = (realCoor.y - sourceLTCoor.y);
  }
  targetCoor.x = realCoor.x * scale.value + xOffsetGrid + offsetX.value + offsetCanvasLeft;
  targetCoor.y = realCoor.y * scale.value + yOffsetGrid + offsetY.value + offsetCanvasTop;
}

function transCanvas2RealInfo(targetCoor, canvasCoor) {
  let xOffsetGrid = 0, yOffsetGrid = 0;
  if (scale.value >= gridLimit) {
    const xResult = (canvasCoor.x - canvasLTCoor.x) / (scale.value + 1);
    const yResult = (canvasCoor.y - canvasLTCoor.y) / (scale.value + 1);
    xOffsetGrid = Number.isInteger(xResult) ? xResult : Math.floor(xResult) + 1;
    yOffsetGrid = Number.isInteger(yResult) ? yResult : Math.floor(yResult) + 1;
  }

  targetCoor.x = Math.floor((canvasCoor.x - xOffsetGrid - offsetX.value -offsetCanvasLeft) / scale.value);
  targetCoor.y = Math.floor((canvasCoor.y - yOffsetGrid - offsetY.value -offsetCanvasTop) / scale.value);

}

function updateRectanglePosition(left, top) {
  if(scale.value >= gridLimit) return;
  // 获取 .rectangle 元素
  let rectangle = document.querySelector('.rectangle');

  // 更新 left 和 top 属性
  rectangle.style.left = left + 'px';
  rectangle.style.top = top + 'px';
}

async function updateViewSize() {
  if (divRef.value) {
    viewportWidth.value = divRef.value.offsetWidth - 4; // - 4(border 2 * 2)
    viewportHeight.value = divRef.value.offsetHeight - 4;
    await nextTick()
    //console.log('updateViewSize');
    //Reset ctx.value when update canvasSize
    initCanvasSettings();
    updateViewPortDraw();
  }
}

function initCanvasSettings() {
  if (canvas === null || canvas.value === null) return;
  if (ctx === null || ctx.value === null) {
    ctx.value = canvas.value.getContext('2d');
  }

  // 禁用图像平滑，使图像像素化
  ctx.value.imageSmoothingEnabled = false;
  ctx.value.mozImageSmoothingEnabled = false;
  ctx.value.webkitImageSmoothingEnabled = false;
  ctx.value.msImageSmoothingEnabled = false;
}

function initZoomSettings() {
  const zoomctx = zoomView.value.getContext('2d');
  zoomctx.imageSmoothingEnabled = false;
  zoomctx.mozImageSmoothingEnabled = false;
  zoomctx.webkitImageSmoothingEnabled = false;
  zoomctx.msImageSmoothingEnabled = false;
  zoomctx.fillStyle = 'rgb(255,0,0)'; // 设置颜色
}
</script>

<style scoped>
*{
  user-select: none;
}
.container {
  box-sizing: border-box;
  display: flex;
  width: 100%;
  height: 100%;
  padding: 20px;
  background-color: white;
}

.tool-container {
  margin-left: auto;
  margin-right: 0;
  width: 122px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.zoomViewBox {
  border: 1px dotted #333;
  margin-bottom: 20px;
  display: flex;
}
.zoom-style {
  width: 120px;
  height: 120px;
  border: none;
}

.fileInfo-style {
  font-size: 16px;
  margin-bottom: 20px;
  word-wrap: break-word;
}

.button-style {
  border-radius: 12px;
  background-color: #4caf50;
  color: white;
  border: none;
  padding: 8px 8px;
  text-align: center;
  text-decoration: none;
  font-size: 16px;
  width: calc(100%);
  cursor: pointer;
}

.delete-button-style {
  border-radius: 12px;
  background-color: #f44336;
  /* 修改背景颜色为红色 */
  color: white;
  border: none;
  padding: 8px 8px;
  text-align: center;
  text-decoration: none;
  display: inline-block;
  /* 修改为内联块以适应多个按钮 */
  font-size: 16px;
  margin-bottom: 15px;
  /* 修改边距以适应多个按钮 */
  cursor: pointer;
}

.image-container {
  box-sizing: border-box;
  background: url('../src/assets/bg.png') repeat;
  width: calc(100% - 166px);
  /*20*2 + 120 + 2((1)*2) + 4(blankspace)*/
  height: calc(100% - 40px);
  position: fixed;
  top: 20px;
  left: 20px;
  overflow: hidden;
  border: 2px solid gray;
}

.dot {
  position: absolute;
  width: 1px;
  height: 1px;
  background-color: red;
}

.rectangle {
  position: absolute;
  width: 6px;
  /* 矩形的宽度 */
  height: 6px;
  /* 矩形的高度 */
  border: 1px solid rgba(255, 0, 0, 0.5);
  /* 红色的边界 */
  background-color: transparent;
  /* 透明的背景色 */
  pointer-events: none;
  /* 忽略鼠标事件 */
}

.button-group {
  display: flex;
  flex-direction: column;
  row-gap: 10px;
}
</style>
