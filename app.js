const fileInput = document.getElementById('mhtFile');
const extractBtn = document.getElementById('extractBtn');
const output = document.getElementById('output');
const status = document.getElementById('status');
const resultsContainer = document.getElementById('results-container');
const noticeBanner = document.getElementById('noticeBanner');
const callButton = document.getElementById('callNow');

function displayResults(result) {
  if (!result.summary) return;

  const summary = result.summary;
  const studentInfo = result.studentInfo;

  // Display student information
  const studentInfoDiv = document.createElement('div');
  studentInfoDiv.className = 'student-info-section';
  studentInfoDiv.innerHTML = `
    <div class="student-info-card">
      <div class="student-name">${studentInfo.name}</div>
    </div>
  `;

  if (!resultsContainer.querySelector('.student-info-section')) {
    resultsContainer.insertBefore(studentInfoDiv, resultsContainer.firstChild);
  } else {
    resultsContainer.querySelector('.student-info-section').replaceWith(studentInfoDiv);
  }

  document.getElementById('total-correct').textContent = summary.total.correct;
  document.getElementById('total-wrong').textContent = summary.total.wrong;
  document.getElementById('total-unattempted').textContent = summary.total.unattempted;
  document.getElementById('total-questions').textContent = summary.total.total;
  document.getElementById('total-marks').textContent = `${summary.total.marks}/${summary.total.maxMarks}`;

  const percentage = summary.total.maxMarks > 0
    ? ((summary.total.marks / summary.total.maxMarks) * 100).toFixed(2)
    : 0;
  document.getElementById('percentage-display').textContent = `Score: ${percentage}%`;

  noticeBanner.classList.remove('hidden');
  callButton.classList.remove('hidden');

  const subjectsContainer = document.getElementById('subjects-container');
  subjectsContainer.innerHTML = '';

  Object.entries(summary.subjects).forEach(([subject, stats]) => {
    const subjectDiv = document.createElement('div');
    subjectDiv.className = 'subject-card';

    const subjectPercentage = stats.maxMarks > 0
      ? ((stats.marks / stats.maxMarks) * 100).toFixed(2)
      : 0;

    subjectDiv.innerHTML = `
      <div class="subject-header">${subject}</div>
      <div class="subject-stats">
        <div class="stat-item correct">
          <span class="stat-label">Correct</span>
          <span class="stat-value">${stats.correct}/${stats.total}</span>
        </div>
        <div class="stat-item wrong">
          <span class="stat-label">Wrong</span>
          <span class="stat-value">${stats.wrong}</span>
        </div>
        <div class="stat-item unattempted">
          <span class="stat-label">Unattempted</span>
          <span class="stat-value">${stats.unattempted}</span>
        </div>
      </div>
      <div class="subject-percentage">${stats.marks}/${stats.maxMarks} marks • ${subjectPercentage}%</div>
    `;

    subjectsContainer.appendChild(subjectDiv);
  });

  resultsContainer.style.display = 'block';
}

function parseHeaders(rawHeaders) {
  return rawHeaders.split(/\r?\n/).reduce((acc, line) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) return acc;
    const name = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    acc[name] = value;
    return acc;
  }, {});
}

function decodeQuotedPrintable(text) {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeBase64(text) {
  const cleaned = text.replace(/[\r\n\t ]+/g, '');
  try {
    return atob(cleaned);
  } catch (error) {
    return '';
  }
}

function extractHtmlFallback(text) {
  const match = text.match(/<html[\s\S]*<\/html>/i);
  return match ? match[0] : '';
}

function parseMhtToHtml(mhtText) {
  const boundaryMatch = mhtText.match(/boundary="?([^";\r\n]+)"?/i);
  if (!boundaryMatch) {
    return extractHtmlFallback(mhtText);
  }

  const boundary = boundaryMatch[1].trim();
  const parts = mhtText.split(new RegExp(`--${boundary}(?:--)?`, 'g')).map(part => part.trim()).filter(Boolean);

  for (const part of parts) {
    const [rawHeaders, ...bodyParts] = part.split(/\r?\n\r?\n/);
    if (!rawHeaders || bodyParts.length === 0) continue;

    const headers = parseHeaders(rawHeaders);
    const contentType = headers['content-type'] || '';
    const encoding = (headers['content-transfer-encoding'] || '').toLowerCase();
    let body = bodyParts.join('\r\n\r\n').trim();

    if (/text\/html/i.test(contentType)) {
      if (encoding === 'base64') {
        body = decodeBase64(body);
      } else if (encoding === 'quoted-printable') {
        body = decodeQuotedPrintable(body);
      }
      return body;
    }
  }

  return extractHtmlFallback(mhtText);
}

function normalizeHeader(value) {
  if (!value) return null;
  const text = value.trim().toLowerCase();
  if (/question\s*id|question\s*no|q\s*no|q\s*id/.test(text)) return 'questionId';
  if (/section|subject/.test(text)) return 'subject';
  if (/candidate.*response|your.*response|response/.test(text)) return 'candidateResponse';
  if (/correct.*option|correct.*answer|answer.*key|right.*option/.test(text)) return 'correctOption';
  return text.replace(/\s+/g, '_');
}

function parseRow(cells, headers) {
  const row = {};
  cells.forEach((cell, index) => {
    const header = headers[index] || `column_${index}`;
    row[header] = cell.textContent.trim();
  });
  return row;
}

function extractLabelValue(text, patterns) {
  if (!text) return '';
  for (const pattern of patterns) {
    const regex = new RegExp(`${pattern}\\s*[:\-]?\\s*([^\\r\\n]+)`, 'i');
    const match = text.match(regex);
    if (match) return match[1].trim();
  }
  return '';
}

function normalizeNameCandidate(value) {
  if (!value) return '';
  let name = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  name = name.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').trim();
  name = name.replace(/\s{2,}/g, ' ');
  return name;
}

function isValidNameCandidate(name) {
  if (!name) return false;
  const normalized = name.trim();
  if (normalized.length < 3 || normalized.length > 80) return false;
  if (/\d|@|http|www|option|response|question|section|physics|logout|objection|assessment|subject/i.test(normalized)) return false;
  const words = normalized.split(' ').filter(Boolean);
  return words.length >= 2 && words.length <= 5;
}

function extractNameFromText(text) {
  if (!text) return '';
  const normalizedText = text.replace(/[\r\n]+/g, '\n');
  const patterns = [
    /(?:candidate|student|full)\s*name\s*[:\-]\s*([^\n]+)/i,
    /\bname\s*[:\-]\s*([^\n]+)/i,
    /\b(?:candidate|student)\s*[:\-]\s*([^\n]+)/i,
    /\b\d{4,}\s*[-–]\s*([A-Z][A-Z\s]{3,60})\b/,
    /\b([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+)+)\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/
  ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    if (match && match[1]) {
      const candidate = normalizeNameCandidate(match[1]);
      if (isValidNameCandidate(candidate)) {
        return candidate;
      }
    }
  }

  return '';
}

function extractStudentInfo(doc) {
  const text = doc.body ? doc.body.innerText : '';
  let name = '';

  const domSelectors = [
    'nav .dropdown-toggle',
    '.navbar-nav .dropdown-toggle',
    '.nav-link.dropdown-toggle',
    'body'
  ];

  for (const selector of domSelectors) {
    const element = doc.querySelector(selector);
    if (element && element.textContent) {
      const candidate = extractNameFromText(element.textContent);
      if (candidate) {
        name = candidate;
        break;
      }
    }
  }

  if (!name) {
    name = extractNameFromText(text);
  }

  return {
    name: name || 'N/A',
    enrollmentId: extractLabelValue(text, ['Enrollment ID', 'Enrollment No', 'Enrollment Number', 'Enrollment']) || 'N/A',
    email: extractLabelValue(text, ['Email', 'E-mail', 'Email ID', 'Email Address']) || 'N/A',
    rollNumber: extractLabelValue(text, ['Roll Number', 'Roll No', 'Roll', 'Reg No', 'Registration No']) || 'N/A',
    centerCode: extractLabelValue(text, ['Center Code', 'Center', 'Test Center']) || 'N/A'
  };
}

function extractLabelsFromText(text) {
  return {
    correctOption: extractLabelValue(text, ['Correct Option', 'Correct Answer', 'Answer Key']),
    candidateResponse: extractLabelValue(text, ['Candidate Response', 'Your Response', 'Response']),
    questionId: extractLabelValue(text, ['Question ID', 'Question No', 'Q No', 'Q ID']),
    subject: extractLabelValue(text, ['Section', 'Subject'])
  };
}

function extractCetResponseData(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const studentInfo = extractStudentInfo(doc);

  const parseTableRows = () => {
    const results = [];
    const tables = Array.from(doc.querySelectorAll('table'));

    tables.forEach((table, tableIndex) => {
      const rows = Array.from(table.rows);
      if (!rows.length) return;

      const headerCells = Array.from(rows[0].cells);
      const headers = headerCells.map((cell) => normalizeHeader(cell.textContent));
      const items = rows.slice(1).map((row) => {
        const cellValues = Array.from(row.cells);
        const parsed = parseRow(cellValues, headers);
        const questionText = parsed.question || parsed['question_text'] || '';
        const labels = extractLabelsFromText(questionText);
        return {
          questionId: parsed.questionId || parsed['question_id'] || parsed['q_no'] || parsed['q_id'] || parsed['question'] || labels.questionId || '',
          subject: parsed.subject || parsed.section || labels.subject || '',
          candidateResponse: parsed.candidateResponse || parsed.response || parsed['your_response'] || labels.candidateResponse || '',
          correctOption: parsed.correctOption || parsed.answer || parsed['correct_answer'] || labels.correctOption || '',
          raw: Object.fromEntries(Object.entries(parsed).filter(([, value]) => value))
        };
      }).filter((item) => item.questionId || item.subject || item.candidateResponse || item.correctOption);

      if (items.length) {
        results.push({ tableIndex: tableIndex + 1, headers, items });
      }
    });

    return results;
  };

  const parsePageLabels = () => {
    const pageText = doc.body ? doc.body.innerText : '';
    const correctOption = extractLabelValue(pageText, ['Correct Option', 'Correct Answer', 'Answer Key']);
    const candidateResponse = extractLabelValue(pageText, ['Candidate Response', 'Your Response', 'Response']);
    const questionId = extractLabelValue(pageText, ['Question ID', 'Question No', 'Q No', 'Q ID']);
    const subject = extractLabelValue(pageText, ['Section', 'Subject']);

    if (correctOption || candidateResponse || questionId || subject) {
      return [{ questionId, subject, candidateResponse, correctOption }];
    }
    return [];
  };

  const tableResults = parseTableRows();
  const extractedItems = tableResults.flatMap((table) => table.items);
  const fallbackItems = parsePageLabels();
  const allItems = extractedItems.length ? extractedItems : fallbackItems;

  const normalizeValue = (value) => (value || '').toString().trim();
  const getResultType = (candidateResponse, correctOption) => {
    const candidate = normalizeValue(candidateResponse);
    const correct = normalizeValue(correctOption);
    if (!candidate) return 'unattempted';
    if (!correct) return 'wrong';
    return candidate.toLowerCase() === correct.toLowerCase() ? 'correct' : 'wrong';
  };

  const isMathSubject = (subject) => /\b(math|mathematics|mathematical)\b/i.test(subject);
  const summary = { total: { correct: 0, wrong: 0, unattempted: 0, total: allItems.length, marks: 0, maxMarks: 0 }, subjects: {} };
  const debugItems = [];

  allItems.forEach((item) => {
    const subject = normalizeValue(item.subject) || 'Unknown';
    const math = isMathSubject(subject);
    if (!summary.subjects[subject]) {
      summary.subjects[subject] = { correct: 0, wrong: 0, unattempted: 0, total: 0, marks: 0, maxMarks: 0 };
    }

    const resultType = getResultType(item.candidateResponse, item.correctOption);
    const questionMax = math ? 2 : 1;
    const questionMarks = resultType === 'correct' ? questionMax : 0;

    debugItems.push({
      qId: item.questionId,
      subject,
      candidate: normalizeValue(item.candidateResponse),
      correct: normalizeValue(item.correctOption),
      resultType,
      marks: questionMarks,
      maxMarks: questionMax
    });

    summary.subjects[subject][resultType] += 1;
    summary.subjects[subject].total += 1;
    summary.subjects[subject].marks += questionMarks;
    summary.subjects[subject].maxMarks += questionMax;

    summary.total[resultType] += 1;
    summary.total.marks += questionMarks;
    summary.total.maxMarks += questionMax;
  });

  return {
    extractedAt: new Date().toISOString(),
    studentInfo,
    items: allItems,
    summary,
    debugItems,
    tables: tableResults
  };
}

extractBtn.addEventListener('click', () => {
  output.value = '';
  const file = fileInput.files[0];
  if (!file) {
    status.textContent = 'Please choose an .mht file first.';
    return;
  }

  status.textContent = `Reading ${file.name}...`;
  const reader = new FileReader();

  reader.onload = () => {
    const html = parseMhtToHtml(reader.result);
    if (!html) {
      status.textContent = 'Could not parse HTML from the selected MHT file.';
      return;
    }

    const result = extractCetResponseData(html);
    output.value = JSON.stringify(result, null, 2);
    status.textContent = `Processed ${result.items.length} rows from ${file.name}.`;
    displayResults(result);
  };

  reader.onerror = () => {
    status.textContent = 'Failed to read the MHT file.';
  };

  reader.readAsText(file);
});