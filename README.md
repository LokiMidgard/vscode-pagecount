# VSCode - PageCount README

This extension is based on the WordCount sample extension.

![Screenshot](images/Screenshot.png)

## Functionality

This extension provides a simple, automatic word count feature for text files, with default activation for `*.md` files (this can be changed). It displays the word count, line count, an estimated page count (based on a configurable setting), and an estimated reading time (configurable by age group) in the status bar, all updated in real-time.

Additionally, it shows these stats aggregated across all files.

You can configure which file types to track for word count and specify files or directories to exclude (e.g., `node_modules` is excluded by default). Opening an excluded file will still display its stats, but they won't contribute to the overall totals.

The page estimation can be customized to use either word count or line count, with settings available for both `pagecount.pagesizeInWords` and `pagecount.pagesizeInLines`.

If the status bar text is too long for your preference, you can also configure which stats are displayed, allowing you to focus only on the metrics that matter most to you.

## What it doesn't do

This extension works with plain text and does not interpret Markdown syntax. It counts elements like dashes from lists and `#` from headings as words. Similarly, frontmatter lines and words are also included in the word count.

In the future, Markdown parsing (e.g., using remark) may be added, but for now, this is beyond the scope of the extension. However, pull requests are welcome if you'd like to contribute and implement this feature! 😉
