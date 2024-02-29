// OpenCVの準備ができたら処理を開始する
cv.onRuntimeInitialized = () => {
    // HTMLのcanvas要素を取得
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    // 画像を読み込む
    const img = new Image();
    img.src = 'goodroom_cafe08.jpg'; // 画像のパスを指定してください

    // 画像が読み込まれたら処理を続行
    img.onload = () => {
        // 画像をcanvasに描画
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // クリックイベントリスナーを追加
        canvas.addEventListener('click', (event) => {
            // クリックされた位置を取得
            const x = event.offsetX;
            const y = event.offsetY;

            // 画像データを取得
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const src = cv.matFromImageData(imageData);

            // グレースケール変換
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // エッジ検出
            const edges = new cv.Mat();
            cv.Canny(gray, edges, 50, 150, 3, false);

            // クリックした位置の色を取得
            const color = [255, 0, 0, 255]; // 赤色 (BGR形式)

            // 塗装
            const data = new Uint8ClampedArray(edges.data);
            const index = (y * canvas.width + x) * 4;
            data[index] = color[0]; // Blue
            data[index + 1] = color[1]; // Green
            data[index + 2] = color[2]; // Red
            data[index + 3] = color[3]; // Alpha

            // エッジ検出後の画像データの長さを正しい長さに調整
            const paintedData = new Uint8ClampedArray(canvas.width * canvas.height * 4);
            paintedData.set(data.slice(0, paintedData.length)); // エッジ検出データから必要な長さだけ取得

            // 塗装後のデータをcanvasに描画
            const paintedImageData = new ImageData(paintedData, canvas.width, canvas.height);
            ctx.putImageData(paintedImageData, 0, 0);


            // メモリ解放
            src.delete();
            gray.delete();
            edges.delete();
        });
    };
};
