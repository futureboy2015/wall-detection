// ページがロードされたときに実行される関数
window.onload = () => {
  // ページがロードされたらファイル選択ボタンの値をリセットする
  document.getElementById("fileInput").value = null;
  document.getElementById("fileInputTexture").value = null;
};

// OpenCVの準備ができたら処理を開始する
cv.onRuntimeInitialized = () => {
  const cannyMinThres = 30.0;
  const ratio = 2.5;

  // HTMLのcanvas要素を取得
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  // 塗装先画像
  const houseImage = new Image();
  // テクスチャー画像
  const textureImage = new Image();

  //塗装先画像ファイルの読み込み処理
  document.getElementById("fileInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      houseImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  //テクスチャー画像ファイルの読み込み処理
  document
    .getElementById("fileInputTexture")
    .addEventListener("change", (event) => {
      const fileTexture = event.target.files[0];
      const readerTexture = new FileReader();

      readerTexture.onload = (e) => {
        textureImage.src = e.target.result;
      };
      readerTexture.readAsDataURL(fileTexture);
    });

  // ベタ指定用
  // document.getElementById("paintModule").style.display = "block";
  // const img = new Image();
  // img.src = "house3.jpg";
  // const textureImg = new Image();
  // textureImg.src =
  //   "pngtree-natural-stone-texture-the-perfect-background-for-tile-wall-designs-image_13580036.png";

  // 処理実行
  const executeButton = document.getElementById("executeButton");
  executeButton.onclick = () => {
    if (!houseImage) {
      // houseImageが読み込まれていない場合、エラーモーダルを表示
      alert("塗装先画像がまだ読み込まれていません。");
      return;
    }
    if (!textureImage) {
      alert("テクスチャー画像がまだ読み込まれていません。");
      return;
    }
    document.getElementById("paintModule").style.display = "block";
    textureWall(houseImage, textureImage);
  };

  /**
   * テクスチャー貼り付け
   * @param {} img 塗装先画像
   * @param {*} textureImg テクスチャー画像
   */
  function textureWall(img, textureImg) {
    const canvasWidth = img.width;
    const canvasHeight = img.height;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.drawImage(img, 0, 0);

    // テクスチャー画像取得
    const textureImgMat = new cv.Mat();
    const textureMat = convertTextureImageToMat(textureImg);
    showImage("canvasTexture", textureMat);

    canvas.addEventListener("click", (event) => {
      // クリックされた位置を取得
      const xPoint = event.offsetX;
      const yPoint = event.offsetY;
      console.log(xPoint);
      console.log(yPoint);

      // 画像データを取得
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = cv.matFromImageData(imageData);

      // RGB取得
      const rgb = new cv.Mat();
      cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

      // グレースケール変換
      const gray = new cv.Mat();
      cv.cvtColor(rgb, gray, cv.COLOR_RGBA2GRAY);
      showImage("canvasGray", gray);

      // HSV変換
      const hsv = new cv.Mat();
      cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
      showImage("canvasHSV", hsv);

      // Sチャンネル取得
      const sChannel = new cv.MatVector();
      cv.split(hsv, sChannel);
      const sCanvas = document.createElement("canvas");
      showImage("canvasS", sChannel.get(1));
      document.body.appendChild(sCanvas);

      // ぼかし処理(グレースケール)
      const blurredGray = new cv.Mat();
      cv.medianBlur(gray, blurredGray, 3);
      showImage("canvasBlurredGray", blurredGray);

      const blurredSChannel = new cv.Mat();
      cv.medianBlur(sChannel.get(1), blurredSChannel, 3);
      showImage("canvasBlurredS", blurredSChannel);

      // Cannyエッジ検出(グレースケール)
      const edgesGray = new cv.Mat();
      cv.Canny(
        blurredGray,
        edgesGray,
        cannyMinThres,
        cannyMinThres * ratio,
        3,
        false
      );
      showImage("canvasEdgesGray", edgesGray);

      // Cannyエッジ検出(Sチャネル)
      const edgesS = new cv.Mat();
      cv.Canny(
        blurredSChannel,
        edgesS,
        cannyMinThres,
        cannyMinThres * ratio,
        3,
        false
      );
      showImage("canvasEdgesS", edgesS);

      // エッジ画像のマージ
      const mergedEdges = new cv.Mat();
      cv.addWeighted(edgesS, 0.5, edgesGray, 0.5, 0, mergedEdges);
      showImage("canvasMergedEdges", mergedEdges);

      // マスク作成
      const mask = new cv.Mat();
      const maskWidth = Math.floor(edgesGray.height / 8.0);
      const maskHeight = Math.floor(edgesGray.width / 8.0);
      mask.setTo(new cv.Scalar(0.0));
      const M = new cv.Mat(
        Math.floor(maskWidth / 8.0),
        Math.floor(maskHeight / 8.0),
        cv.CV_8UC1,
        new cv.Scalar(0.0)
      );
      // 膨張処理
      const dilatedEdges = new cv.Mat();
      cv.dilate(mergedEdges, dilatedEdges, M);
      showImage("canvasDilatedEdges", dilatedEdges);

      // シードポイントのリサイズ
      const seedPoint = new cv.Point(xPoint, yPoint);
      cv.resize(
        dilatedEdges,
        dilatedEdges,
        new cv.Size(dilatedEdges.cols + 2, dilatedEdges.rows + 2)
      );

      // 論理和用にエッジ画像を待避しておく(Flood-fillされるため)
      const copyDilatedEdges = new cv.Mat();
      dilatedEdges.copyTo(copyDilatedEdges);

      // Flood-fill(塗りつぶし)
      let floodedImage = rgb.clone();
      const floodFillFlag = 8;
      const color = new cv.Scalar(0, 0, 0);
      const loDiff = new cv.Scalar(20, 20, 20, 20);
      const upDiff = new cv.Scalar(20, 20, 20, 20);

      cv.floodFill(
        floodedImage,
        dilatedEdges,
        seedPoint,
        color,
        new cv.Rect(),
        loDiff,
        upDiff,
        floodFillFlag
      );
      showImage("canvasFlooded", floodedImage);

      // Flood-fill(論理和用)
      const maskEdge = new cv.Mat(rgb.size(), rgb.type());
      cv.floodFill(
        maskEdge,
        copyDilatedEdges,
        seedPoint,
        new cv.Scalar(255, 255, 255),
        new cv.Rect(),
        loDiff,
        upDiff,
        floodFillFlag
      );
      showImage("canvasDilatedRgb", maskEdge);

      // 論理積取得
      cv.bitwise_and(maskEdge, textureMat, textureImgMat);

      // 論理和取得
      const resultImage = new cv.Mat();
      cv.bitwise_or(textureImgMat, floodedImage, resultImage);

      // HSVのマージ
      const rgbHsvImage = new cv.Mat();
      cv.cvtColor(resultImage, rgbHsvImage, cv.COLOR_RGB2HSV);

      // Vチャンネルのマージ
      const sChanelRgbHsvImage = new cv.MatVector();
      cv.split(rgbHsvImage, sChanelRgbHsvImage);

      const mergedImage = new cv.Mat();
      cv.merge(sChanelRgbHsvImage, mergedImage);
      cv.cvtColor(mergedImage, mergedImage, cv.COLOR_HSV2RGB);
      showImage("canvasMerged", mergedImage);

      // 元の画像とのマージ
      const finalImage = new cv.Mat();
      // 数字は結合率(右のを重めに)
      cv.addWeighted(mergedImage, 0.4, rgb, 0.6, 0, finalImage);
      showImage("canvasFinal", finalImage);

      // メモリ解放
      gray.delete();
      hsv.delete();
      sChannel.delete();
      blurredGray.delete();
      edgesGray.delete();
      edgesS.delete();
      mergedEdges.delete();
      M.delete();
      dilatedEdges.delete();
      floodedImage.delete();
      mergedImage.delete();
      finalImage.delete();
    });
  }

  function showImage(canvasId, mat) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext("2d");
    cv.imshow(canvas, mat);
  }

  /**
   * テクスチャー画像取得
   * @param {*} textureImg
   * @returns rgb返還後のテクスチャー(mat型)
   */
  function convertTextureImageToMat(textureImg) {
    // テクスチャ画像のピクセルデータをコピーする
    const canvas = document.createElement("canvas");
    canvas.width = textureImg.width;
    canvas.height = textureImg.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(textureImg, 0, 0);
    // 新しいImageDataオブジェクトを作成
    const baseCanvas = document.getElementById("canvas");
    const imageData = new ImageData(baseCanvas.width, baseCanvas.height);
    imageData.data.set(
      ctx.getImageData(0, 0, baseCanvas.width, baseCanvas.height).data
    );
    // OpenCVのcv.matFromImageData関数を使用してImageDataをMatオブジェクトに変換
    const mat = cv.matFromImageData(imageData);

    // rgbに型を合わせる(UncoughtErrorになるので)
    const rgbMat = new cv.Mat();
    cv.cvtColor(mat, rgbMat, cv.COLOR_RGBA2RGB);
    return rgbMat;
  }
};
