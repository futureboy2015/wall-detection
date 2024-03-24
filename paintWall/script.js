// ページがロードされたときに実行される関数
window.onload = () => {
  // ページがロードされたらファイル選択ボタンの値をリセットする
  document.getElementById("fileInput").value = null;
};

// OpenCVの準備ができたら処理を開始する
cv.onRuntimeInitialized = () => {
  const cannyMinThres = 30.0;
  const ratio = 2.5;

  // クリックされたポイントのリスト
  const clickedPoints = [];

  // HTMLのcanvas要素を取得
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  // 画像ファイルの読み込み処理
  document.getElementById("fileInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      document.getElementById("paintModule").style.display = "block";
      const img = new Image();
      img.src = e.target.result;
      // 画像が読み込まれたら処理を続行
      img.onload = () => {
        paintWall(img);
      };
    };
    reader.readAsDataURL(file);
  });

  /**
   * 画像変換処理
   * @param {*} img
   */
  function paintWall(img) {
    const canvasWidth = img.width;
    const canvasHeight = img.height;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.drawImage(img, 0, 0);

    // ペイント用変数
    let isPainting = false; // 塗装中かどうかを示すフラグ
    let prevX = 0;
    let prevY = 0;

    // 元画像rgb(グローバル再塗装モードで利用するためグローバル)
    let rgb;

    canvas.addEventListener("click", (event) => {
      // 画像データを取得
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const src = cv.matFromImageData(imageData);

      // RGB取得
      rgb = new cv.Mat();
      cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

      // グレースケール変換
      const gray = new cv.Mat();
      cv.cvtColor(rgb, gray, cv.COLOR_RGBA2GRAY);
      //showImage("canvasGray", gray);

      // HSV変換
      const hsv = new cv.Mat();
      cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
      //showImage("canvasHSV", hsv);

      // Sチャンネル取得
      const sChannel = new cv.MatVector();
      cv.split(hsv, sChannel);
      const sCanvas = document.createElement("canvas");
      //showImage("canvasS", sChannel.get(1));
      document.body.appendChild(sCanvas);

      // ぼかし処理(グレースケール)
      const blurredGray = new cv.Mat();
      cv.medianBlur(gray, blurredGray, 3);
      //showImage("canvasBlurredGray", blurredGray);

      const blurredSChannel = new cv.Mat();
      cv.medianBlur(sChannel.get(1), blurredSChannel, 3);
      //showImage("canvasBlurredS", blurredSChannel);

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
      //showImage("canvasEdgesGray", edgesGray);

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
      //showImage("canvasEdgesS", edgesS);

      // エッジ画像のマージ
      const mergedEdges = new cv.Mat();
      cv.addWeighted(edgesS, 0.5, edgesGray, 0.5, 0, mergedEdges);
      // showImage("canvasMergedEdges", mergedEdges);

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
      // hsvのエッジもマージする場合はこちら
      // cv.dilate(mergedEdges, dilatedEdges, M);
      // グレースケールのエッジのみで塗装
      cv.dilate(edgesGray, dilatedEdges, M);
      showImage("canvasDilatedEdges", dilatedEdges);

      // クリックされた位置をグローバルに保存
      const xPoint = event.offsetX;
      const yPoint = event.offsetY;

      // クリックされた位置を取得
      const seedPoint = new cv.Point(xPoint, yPoint);
      // クリックされたポイントをリストに追加(複数壁面対応)
      clickedPoints.push(seedPoint);
      
      // 一旦メモリ解放
      gray.delete();
      hsv.delete();
      sChannel.delete();
      blurredGray.delete();
      edgesGray.delete();
      edgesS.delete();
      mergedEdges.delete();

      // シードポイントのリサイズ
      cv.resize(
        dilatedEdges,
        dilatedEdges,
        new cv.Size(dilatedEdges.cols + 2, dilatedEdges.rows + 2)
      );

      // Flood-fill
      const floodedImage = rgb.clone();
      showImage("canvasFlooded", floodedImage);
      const floodFillFlag = 8;
      const color = new cv.Scalar(0, 0, 200, 155);
      const loDiff = new cv.Scalar(20, 20, 20, 20);
      const upDiff = new cv.Scalar(20, 20, 20, 20);
      // クリックポイント分塗装
      for (const point of clickedPoints) {
        cv.floodFill(
          floodedImage,
          dilatedEdges,
          point,
          color,
          new cv.Rect(),
          loDiff,
          upDiff,
          floodFillFlag
        );
      }

      showImage("canvasFlooded", floodedImage);

      // 膨張処理(RGB)
      // 最悪無くてもいいか？
      const dilatedRgb = new cv.Mat();
      cv.dilate(floodedImage, dilatedRgb, M, new cv.Point(0.0, 0.0), 0.5);
      showImage("canvasDilatedRgb", dilatedRgb);
      // メモリ解放
      floodedImage.delete();
      M.delete();

      // HSVのマージ
      const rgbHsvImage = new cv.Mat();
      cv.cvtColor(dilatedRgb, rgbHsvImage, cv.COLOR_RGB2HSV);

      // Vチャンネルのマージ
      const sChanelRgbHsvImage = new cv.MatVector();
      cv.split(rgbHsvImage, sChanelRgbHsvImage);
      // メモリ解放
      rgbHsvImage.delete();

      const mergedImage = new cv.Mat();
      cv.merge(sChanelRgbHsvImage, mergedImage);
      // メモリ解放
      sChanelRgbHsvImage.delete();
      cv.cvtColor(mergedImage, mergedImage, cv.COLOR_HSV2RGB);
      showImage("canvasMerged", mergedImage);

      // 元の画像とのマージ
      const finalImage = new cv.Mat();
      // 数字は結合率(右のを重めに)
      cv.addWeighted(mergedImage, 0.4, rgb, 0.6, 0, finalImage);
      // メモリ解放
      mergedImage.delete();
      showImage("canvasFinal", finalImage);
      // メモリ解放
      finalImage.delete();
    });

    // 塗装済み画像キャンバス(再塗装用)
    const canvasMerged = document.getElementById("canvasMerged");
    // 最終結果キャンバス(マウス検知用)
    const canvasFinal = document.getElementById("canvasFinal");

    // 消しゴム用マスク画像を作成
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskCtx = maskCanvas.getContext("2d");

    // マウスが押されたときのイベント
    canvasFinal.addEventListener("mousedown", (event) => {
      isPainting = true;
      prevX = event.offsetX;
      prevY = event.offsetY;
    });

    // マウスが離されたときのイベント
    canvasFinal.addEventListener("mouseup", () => {
      isPainting = false;
    });

    // マウスが動いたときのイベント
    canvasFinal.addEventListener("mousemove", (event) => {
      if (isPainting) {
        if (document.getElementById("modeChange").textContent === '消しゴムモード') {
          const ctx2 = canvasMerged.getContext("2d");
          const x = event.offsetX;
          const y = event.offsetY;
  
          // マスク画像を生成
          // 直前のポイントから現在のポイントまでを線で結ぶ
          maskCtx.beginPath();
          maskCtx.moveTo(prevX, prevY);
          maskCtx.lineTo(x, y);
          maskCtx.strokeStyle = "white"; // マスク用に白
          maskCtx.lineWidth = 5; // 塗装の太さを設定（任意の太さに変更可能）
          maskCtx.stroke();
  
          const maskImageData = maskCtx.getImageData(
            0,
            0,
            maskCanvas.width,
            maskCanvas.height
          );
          const maskSrc = cv.matFromImageData(maskImageData);
          const mask = new cv.Mat();
          cv.cvtColor(maskSrc, mask, cv.COLOR_RGBA2RGB);
  
          // 現在のポイントを直前のポイントとして更新
          prevX = x;
          prevY = y;
  
          const imageData = ctx2.getImageData(0, 0, canvas.width, canvas.height);
          const src = cv.matFromImageData(imageData);
          const rgbPainted = new cv.Mat();
          // 型合わせ
          cv.cvtColor(src, rgbPainted, cv.COLOR_RGBA2RGB);
  
          // 論理積取得(マスク画像を元画像と結合)
          const maskAndImage = new cv.Mat();
          cv.bitwise_and(mask, rgb, maskAndImage);
  
          mask.delete();
  
          // 論理和取得(マスク画像と塗装済み画像を結合)
          const resultImage = new cv.Mat();
          cv.bitwise_or(maskAndImage, rgbPainted, resultImage);
          maskAndImage.delete();
          showImage("canvasMerged", resultImage);
  
          // 結合した画像を再度元画像と結合
          const finalImage = new cv.Mat();
          // 数字は結合率(右のを重めに)
          cv.addWeighted(resultImage, 0.4, rgb, 0.6, 0, finalImage);
          // メモリ解放
          showImage("canvasFinal", finalImage);
          // メモリ解放
          resultImage.delete();
          finalImage.delete();
          rgbPainted.delete();
        }
        else if (document.getElementById("modeChange").textContent === '追加塗装モード') {
          const ctx2 = canvasMerged.getContext("2d");
          const x = event.offsetX;
          const y = event.offsetY;
  
          // マスク画像を生成
          // 直前のポイントから現在のポイントまでを線で結ぶ
          ctx2.beginPath();
          ctx2.moveTo(prevX, prevY);
          ctx2.lineTo(x, y);
          ctx2.strokeStyle = "blue"; // 任意の色(色はメイン塗装処理と合わせる)
          ctx2.lineWidth = 5; // 塗装の太さを設定（任意の太さに変更可能）
          ctx2.stroke();
  
          // 現在のポイントを直前のポイントとして更新
          prevX = x;
          prevY = y;
  
          const imageData = ctx2.getImageData(0, 0, canvas.width, canvas.height);
          const src = cv.matFromImageData(imageData);
          const rgbPainted = new cv.Mat();
          // 型合わせ
          cv.cvtColor(src, rgbPainted, cv.COLOR_RGBA2RGB);
  
          // 結合した画像を再度元画像と結合
          const finalImage = new cv.Mat();
          // 数字は結合率(右のを重めに)
          cv.addWeighted(rgbPainted, 0.4, rgb, 0.6, 0, finalImage);
          // メモリ解放
          showImage("canvasFinal", finalImage);
          // メモリ解放
          finalImage.delete();
          rgbPainted.delete();
        }
      }
    });

    // マウスがキャンバスから出たときのイベント
    canvas.addEventListener("mouseleave", () => {
      isPainting = false;
    });

    function floodedImage(dilatedEdges) {
      
    }

    /**
     * 再塗装モード切替
     */
    document.getElementById("paint").addEventListener("click", (event) => {
      document.getElementById("modeChange").textContent = "追加塗装モード";
    });
    document.getElementById("delete").addEventListener("click", (event) => {
      document.getElementById("modeChange").textContent = "消しゴムモード";
    });
  }

  function showImage(canvasId, mat) {
    const canvas = document.getElementById(canvasId);
    cv.imshow(canvas, mat);
  }
};
