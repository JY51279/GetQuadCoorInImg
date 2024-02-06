export function getDefultQuadIndex(dotsRealCoor) {
  return defaultQuadIndex;
}

export function resetJsonProcess(jsonStr, classStr, imgStr)
{
  defaultQuadIndex = -1;
  imgIndex = -1;
  try {
    resetJson(jsonStr);
    resetClassKeys(classStr.toUpperCase());
    resetImgIndex(imgStr);
  }
  catch(err) {
    window.alert("Failed resetJsonProcess.");
  }
  if(imgIndex === -1)
  {
    window.alert("imgIndex === -1");
  }
}

const rootKey = "Picture";
const imgKey = "Image Source";
const TotalClassKeys = [
  {
      class: 'DBR',
      key1: 'Barcode Info',
      key2: 'Barcode Location'
    }, 
    {
      class: 'DDN',
      key1: 'Quadrilateral Info',
      key2: 'Expected Quadrilateral Points'
    },
    {
      class: 'DLR',
      key1: 'Label Info',
      key2: 'Label Location'
    }
  ];

let classKeys = {class:'', key1:'', key2:''};
function resetClassKeys(classStr)
{
  for (let i = 0; i < 3; ++i)
  {
      if (TotalClassKeys[i].class === classStr)
      {
        classKeys = TotalClassKeys[i];
        console.log(classKeys);
      }
  }
}

let imgIndex = -1;
function resetImgIndex(imgStr)
{
  for (let i = 0; i < json[rootKey].length; ++i)
  {
    if (json[rootKey][i][imgKey].search(imgStr) !== -1)
    {
      imgIndex = i;
    }
  }
  console.log("imgIndex: " + imgIndex);
}

let json = {};
function resetJson(jsonStr)
{
  json = JSON.parse(jsonStr);
  console.log(json);
}

let defaultQuadIndex = -1;