'use client'

import { useId } from 'react'
import { CKEditor } from '@ckeditor/ckeditor5-react'
import {
  Alignment, AutoLink, Bold, BlockQuote, ClassicEditor, Essentials, GeneralHtmlSupport, Heading, Image, ImageCaption,
  ImageStyle, ImageToolbar, ImageUpload, Italic, Link, List, MediaEmbed, Paragraph, SimpleUploadAdapter, Strikethrough,
  Table, TableToolbar, Underline,
} from 'ckeditor5'
import 'ckeditor5/ckeditor5.css'
import { Label } from './ui'

const UPLOAD_URL = '/api/admin/uploads'
// Providers other than YouTube would produce iframes the sanitizer strips; do not offer them.
const OTHER_PROVIDERS = ['dailymotion', 'spotify', 'vimeo', 'instagram', 'twitter', 'googleMaps', 'flickr', 'facebook']

/**
 * Rich text (HTML) editor, CKEditor 5 self-hosted under the GPL licence key. Uncontrolled after mount: `value` is the
 * initial content, so give it a `key` to load different content. Must be loaded with next/dynamic ssr:false (see
 * L10nRichField); the output is untrusted and is always passed through sanitizeHtml on the server.
 */
export default function RichTextEditor({
  value,
  onChange,
  label,
  minHeight = 240,
}: {
  value: string
  onChange: (html: string) => void
  label: string
  minHeight?: number
}) {
  const id = useId()
  return (
    <div>
      <span id={`${id}-label`}>
        <Label>{label}</Label>
      </span>
      <div className="rich-text-editor" style={{ ['--rte-min-height' as string]: `${minHeight}px` }}>
        <CKEditor
          editor={ClassicEditor}
          data={value}
          onChange={(_event, editor) => onChange(editor.getData())}
          config={{
            licenseKey: 'GPL',
            label,
            plugins: [
              Essentials, Paragraph, Heading, Bold, Italic, Underline, Strikethrough, Link, AutoLink, List, BlockQuote, Alignment,
              Table, TableToolbar, Image, ImageCaption, ImageStyle, ImageToolbar, ImageUpload, SimpleUploadAdapter, MediaEmbed,
              GeneralHtmlSupport,
            ],
            toolbar: {
              items: [
                'undo', 'redo', '|', 'heading', '|', 'bold', 'italic', 'underline', 'strikethrough', '|', 'link', '|',
                'bulletedList', 'numberedList', 'blockQuote', '|', 'alignment', '|', 'insertTable', 'uploadImage', 'mediaEmbed',
              ],
              shouldNotGroupWhenFull: true,
            },
            heading: {
              options: [
                { model: 'paragraph', title: 'Paragraph', class: 'ck-heading_paragraph' },
                { model: 'heading2', view: 'h2', title: 'Heading 2', class: 'ck-heading_heading2' },
                { model: 'heading3', view: 'h3', title: 'Heading 3', class: 'ck-heading_heading3' },
                { model: 'heading4', view: 'h4', title: 'Heading 4', class: 'ck-heading_heading4' },
              ],
            },
            link: { defaultProtocol: 'https://' },
            alignment: { options: ['left', 'center', 'right'] },
            image: {
              toolbar: ['imageStyle:inline', 'imageStyle:block', 'imageStyle:side', '|', 'toggleImageCaption', 'imageTextAlternative'],
            },
            table: { contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'] },
            mediaEmbed: { previewsInData: true, removeProviders: OTHER_PROVIDERS },
            // Same-origin XHR: the browser attaches the session cookie and an Origin header, which adminApi's CSRF check requires.
            simpleUpload: { uploadUrl: UPLOAD_URL, withCredentials: true },
            htmlSupport: {
              // Mirrors the classes sanitizeHtml keeps; anything else is dropped by the editor and the server.
              allow: [{ name: /^(div|span)$/, classes: [/^text-align-.+$/, /^image-style-.+$/] }],
            },
          }}
        />
      </div>
      <style>{`.rich-text-editor .ck-editor__editable_inline{min-height:var(--rte-min-height)}`}</style>
    </div>
  )
}
