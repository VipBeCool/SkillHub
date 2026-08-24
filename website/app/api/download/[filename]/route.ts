import { NextResponse } from "next/server";

const VERSION = "0.1.0";

// 用实际文件名做 key，Chrome 会从 URL 路径中识别文件名，完美解决乱码问题
const ASSET_MAP: Record<string, { url: string; contentType: string }> = {
  [`SkillHub_${VERSION}_universal.dmg`]: {
    url: `https://github.com/VipBeCool/SkillHub/releases/download/v${VERSION}/SkillHub_${VERSION}_universal.dmg`,
    contentType: "application/x-apple-diskimage",
  },
  [`SkillHub_${VERSION}_x64-setup.exe`]: {
    url: `https://github.com/VipBeCool/SkillHub/releases/download/v${VERSION}/SkillHub_${VERSION}_x64-setup.exe`,
    contentType: "application/octet-stream",
  },
  [`SkillHub_${VERSION}_amd64.AppImage`]: {
    url: `https://github.com/VipBeCool/SkillHub/releases/download/v${VERSION}/SkillHub_${VERSION}_amd64.AppImage`,
    contentType: "application/octet-stream",
  },
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const asset = ASSET_MAP[filename];

  if (!asset) {
    return NextResponse.redirect("https://github.com/VipBeCool/SkillHub/releases/latest");
  }

  try {
    const upstream = await fetch(asset.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SkillHub-Website/1.0)" },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return NextResponse.redirect("https://github.com/VipBeCool/SkillHub/releases/latest");
    }

    const headers = new Headers();
    // 双重保险：URL 路径含文件名 + Content-Disposition 强制指定
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    headers.set("Content-Type", asset.contentType);
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);

    return new Response(upstream.body, { status: 200, headers });
  } catch (err) {
    console.error("[download] proxy error:", err);
    return NextResponse.redirect("https://github.com/VipBeCool/SkillHub/releases/latest");
  }
}
